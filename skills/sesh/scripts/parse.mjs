// Session parsers for Claude Code and Codex transcripts.
// Both return the same normalized shape consumed by the card renderer.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { claudeCost, openaiCost } from "./pricing.mjs";

const IDLE_MS = 5 * 60 * 1000;   // gaps longer than this count as idle
// chart resolution: pick a round bucket so the chart has roughly 24-36 bars
const STEPS_MIN = [1, 2, 3, 5, 10, 15, 20, 30, 60, 120];
const bucketFor = (ms) => (STEPS_MIN.find((m) => ms / (m * 60000) <= 36) ?? 240) * 60000;

function readJsonl(file) {
  const out = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip partial line */ }
  }
  return out;
}

// Turn a list of [timestampMs, tokens] events into moving time + a pace series
// that skips idle gaps, so the chart reads like an activity, not a wall clock.
function timeline(stamps, events) {
  const ts = [...stamps].sort((a, b) => a - b);
  if (!ts.length) return { start: Date.now(), elapsedMs: 0, movingMs: 0, series: [], bucketMin: 1 };
  let moving = 0;
  const clock = new Map(); // wall ms -> moving ms
  clock.set(ts[0], 0);
  for (let i = 1; i < ts.length; i++) {
    const gap = ts[i] - ts[i - 1];
    if (gap < IDLE_MS) moving += gap;
    clock.set(ts[i], moving);
  }
  const movingAt = (t) => {
    // nearest known stamp at or before t
    let lo = 0, hi = ts.length - 1, best = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (ts[mid] <= t) { best = mid; lo = mid + 1; } else hi = mid - 1; }
    return clock.get(ts[best]);
  };
  const BUCKET_MS = bucketFor(moving);
  const buckets = Math.max(1, Math.ceil(moving / BUCKET_MS));
  const series = new Array(buckets).fill(0);
  for (const [t, tok] of events) {
    const b = Math.min(buckets - 1, Math.floor(movingAt(t) / BUCKET_MS));
    series[b] += tok;
  }
  return { start: ts[0], elapsedMs: ts.at(-1) - ts[0], movingMs: moving, series, bucketMin: BUCKET_MS / 60000 };
}

const isHumanText = (s) => typeof s === "string" && s.trim() && !s.trimStart().startsWith("<");

/* ---------------- Claude Code ---------------- */

export function claudeProjectDir(cwd) {
  return join(homedir(), ".claude", "projects", cwd.replace(/[^A-Za-z0-9]/g, "-"));
}

export function findClaudeSession({ id, cwd }) {
  const root = join(homedir(), ".claude", "projects");
  if (id) {
    const direct = join(claudeProjectDir(cwd), `${id}.jsonl`);
    if (existsSync(direct)) return direct;
    for (const d of safeList(root)) {
      const f = join(root, d, `${id}.jsonl`);
      if (existsSync(f)) return f;
    }
    return null;
  }
  return newest(safeList(claudeProjectDir(cwd)).filter((f) => f.endsWith(".jsonl")).map((f) => join(claudeProjectDir(cwd), f)));
}


function newAcc() {
  return { stamps: [], events: [], tools: {}, files: new Set(), input: 0, output: 0, cacheRead: 0, cacheWrite: 0, subagents: 0, seen: new Set(), usd: 0, unpriced: 0 };
}

// Usage, tool calls and activity from one Claude transcript (main or subagent).
function scanClaudeWork(rows, acc) {
  const seen = acc.seen; // shared, so a response copied into two files counts once
  for (const r of rows) {
    if (r.timestamp && (r.type === "user" || r.type === "assistant")) acc.stamps.push(+new Date(r.timestamp));
    if (r.type !== "assistant" || !r.message) continue;
    const m = r.message;
    for (const b of m.content ?? []) {
      if (b.type !== "tool_use") continue;
      acc.tools[b.name] = (acc.tools[b.name] ?? 0) + 1;
      if (b.input?.file_path && /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(b.name)) acc.files.add(b.input.file_path);
    }
    // One API response is written as several lines that repeat the same usage.
    const key = m.id ?? r.requestId ?? r.uuid;
    if (seen.has(key)) continue;
    seen.add(key);
    const u = m.usage ?? {};
    const i = u.input_tokens ?? 0, o = u.output_tokens ?? 0, cr = u.cache_read_input_tokens ?? 0, cw = u.cache_creation_input_tokens ?? 0;
    acc.input += i; acc.output += o; acc.cacheRead += cr; acc.cacheWrite += cw;
    const usd = claudeCost(m.model, u);
    if (usd == null) acc.unpriced += i + o + cr + cw; else acc.usd += usd;
    if (r.timestamp) acc.events.push([+new Date(r.timestamp), i + o + cr + cw]);
  }
}

export function parseClaude(file) {
  const rows = readJsonl(file);
  const acc = newAcc();
  let prompts = 0, model = "", title = "", firstPrompt = "", cwd = "", branch = "";

  for (const r of rows) {
    if (r.type === "custom-title" && r.customTitle) title = r.customTitle;
    if (r.type === "summary" && r.summary && !title) title = r.summary;
    cwd ||= r.cwd || "";
    branch ||= r.gitBranch || "";
    if (r.type === "assistant" && r.message?.model && r.message.model !== "<synthetic>") model = r.message.model;
    if (r.type === "user" && !r.isMeta && !r.isSidechain) {
      const c = r.message?.content;
      const text = typeof c === "string" ? c : Array.isArray(c) ? c.filter((b) => b.type === "text").map((b) => b.text).join("\n") : "";
      const isToolResult = Array.isArray(c) && c.some((b) => b.type === "tool_result");
      if (!isToolResult && isHumanText(text)) { prompts++; firstPrompt ||= text; }
      // A slash command you typed is a prompt too, except /sesh itself.
      const cmd = text.match(/<command-name>\/?([^<\s]+)<\/command-name>/);
      if (!isToolResult && cmd && !/^(sesh(:sesh)?)$/.test(cmd[1])) prompts++;
    }
  }
  scanClaudeWork(rows, acc);

  // Subagents of this session live in <session-id>/subagents/*.jsonl.
  // Their work belongs to this session; their prompts are written by the agent, not you.
  const subDir = join(file.replace(/\.jsonl$/, ""), "subagents");
  for (const f of safeList(subDir)) {
    if (!f.endsWith(".jsonl")) continue;
    scanClaudeWork(readJsonl(join(subDir, f)), acc);
    acc.subagents++;
  }

  return finish({
    agent: "claude", id: basename(file, ".jsonl"), title, firstPrompt, cwd, branch, model,
    tokens: { input: acc.input, output: acc.output, cacheRead: acc.cacheRead, cacheWrite: acc.cacheWrite },
    usd: acc.usd, unpricedTokens: acc.unpriced,
    prompts, tools: acc.tools, filesTouched: acc.files.size, subagents: acc.subagents, stamps: acc.stamps, events: acc.events,
  });
}

/* ---------------- Codex ---------------- */

// session_meta of a rollout, read from the head of the file only.
function codexMeta(file) {
  try {
    const head = readFileSync(file, "utf8").slice(0, 200000);
    for (const line of head.split("\n")) {
      if (!line.includes('"session_meta"')) continue;
      const r = JSON.parse(line);
      if (r.type === "session_meta") {
        const p = r.payload ?? {};
        const parent = p.source?.subagent?.thread_spawn?.parent_thread_id ?? null;
        return { id: p.id, cwd: p.cwd, parent, subagent: p.thread_source === "subagent" || !!parent };
      }
    }
  } catch { /* unreadable */ }
  return null;
}

function codexIndex() {
  const root = join(homedir(), ".codex", "sessions");
  return walk(root)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({ file: f, mtime: statSync(f).mtimeMs, ...(codexMeta(f) ?? {}) }))
    .sort((a, b) => b.mtime - a.mtime);
}

export function findCodexSession({ id, cwd }) {
  const all = codexIndex();
  if (id) {
    const hit = all.find((x) => x.id === id || x.file.includes(id));
    if (!hit) return null;
    // An id that points at a subagent resolves to the session that spawned it.
    let cur = hit;
    while (cur?.subagent && cur.parent) cur = all.find((x) => x.id === cur.parent) ?? null;
    return cur?.file ?? hit.file;
  }
  // Newest top-level session started in this folder. Subagent threads are never picked.
  return all.find((x) => !x.subagent && x.cwd === cwd)?.file ?? null;
}

function scanCodexWork(rows, acc) {
  let last = null, prev = 0;
  let model = "";
  for (const r of rows) {
    const p = r.payload ?? {};
    if (r.timestamp && (r.type === "response_item" || r.type === "event_msg")) acc.stamps.push(+new Date(r.timestamp));
    if (r.type === "turn_context" && p.model) model = p.model;
    if (r.type === "response_item" && (p.type === "function_call" || p.type === "custom_tool_call" || p.type === "local_shell_call")) {
      const n = p.name ?? p.type;
      acc.tools[n] = (acc.tools[n] ?? 0) + 1;
    }
    if (r.type === "event_msg" && p.type === "token_count" && p.info?.total_token_usage) {
      last = p.info.total_token_usage;
      if (p.info.last_token_usage) {
        const u = p.info.last_token_usage;
        const usd = openaiCost(model, u);
        if (usd == null) acc.unpriced += (u.input_tokens ?? 0) + (u.output_tokens ?? 0); else acc.usd += usd;
      }
      const total = last.total_tokens ?? 0;
      if (r.timestamp && total > prev) acc.events.push([+new Date(r.timestamp), total - prev]);
      prev = Math.max(prev, total);
    }
  }
  // total_token_usage is cumulative per thread, so the last one is the thread total.
  // Codex reports cached tokens inside input_tokens.
  const cached = last?.cached_input_tokens ?? 0;
  acc.input += Math.max(0, (last?.input_tokens ?? 0) - cached);
  acc.cacheRead += cached;
  acc.cacheWrite += last?.cache_write_input_tokens ?? 0;
  acc.output += last?.output_tokens ?? 0;
}

export function parseCodex(file) {
  const rows = readJsonl(file);
  const acc = newAcc();
  let id = "", cwd = "", branch = "", model = "", prompts = 0, firstPrompt = "", title = "";

  for (const r of rows) {
    const p = r.payload ?? {};
    if (r.type === "session_meta") { id ||= p.id; cwd ||= p.cwd; branch ||= p.git?.branch ?? ""; }
    if (r.type === "turn_context") { model = p.model || model; cwd ||= p.cwd; }
    if (r.type === "event_msg" && p.type === "user_message" && isHumanText(p.message)) { prompts++; firstPrompt ||= p.message; }
    if (r.type === "event_msg" && p.type === "thread_name_updated" && p.thread_name) title = p.thread_name;
  }
  // Some Codex builds write no user_message events: count the real user messages instead.
  if (!prompts) {
    for (const r of rows) {
      const p = r.payload ?? {};
      if (r.type !== "response_item" || p.type !== "message" || p.role !== "user") continue;
      const text = (p.content ?? []).map((c) => c.text ?? "").join("\n");
      if (isHumanText(text)) { prompts++; firstPrompt ||= text; }
    }
  }
  scanCodexWork(rows, acc);

  // Roll up every subagent thread spawned from this session, at any depth.
  const all = codexIndex();
  const queue = [id];
  const done = new Set(queue);
  while (queue.length) {
    const parent = queue.shift();
    for (const child of all.filter((x) => x.subagent && x.parent === parent && !done.has(x.id))) {
      done.add(child.id);
      queue.push(child.id);
      scanCodexWork(readJsonl(child.file), acc);
      acc.subagents++;
    }
  }

  return finish({
    agent: "codex", id: id || basename(file, ".jsonl"), title, firstPrompt, cwd, branch, model,
    tokens: { input: acc.input, output: acc.output, cacheRead: acc.cacheRead, cacheWrite: acc.cacheWrite },
    usd: acc.usd, unpricedTokens: acc.unpriced,
    prompts, tools: acc.tools, filesTouched: null, subagents: acc.subagents, stamps: acc.stamps, events: acc.events,
  });
}

/* ---------------- shared ---------------- */

function finish(s) {
  const t = timeline(s.stamps, s.events);
  const { input, output, cacheRead, cacheWrite } = s.tokens;
  const total = input + output + cacheRead + cacheWrite;
  const promptSide = input + cacheRead + cacheWrite;
  const title = (s.title || s.firstPrompt.split("\n")[0].replace(/^[#>*\-\s]+/, "") || basename(s.cwd || "session")).trim();
  return {
    agent: s.agent,
    id: s.id,
    title: title.length > 42 ? title.slice(0, 40).trimEnd() + "…" : title,
    project: basename(s.cwd || ""),
    branch: s.branch,
    model: s.model || "unknown",
    start: new Date(t.start),
    elapsedMs: t.elapsedMs,
    movingMs: t.movingMs,
    series: t.series,
    bucketMin: t.bucketMin,
    tokens: { ...s.tokens, total },
    cacheHit: promptSide ? cacheRead / promptSide : 0,
    prompts: s.prompts,
    toolCalls: Object.values(s.tools).reduce((a, b) => a + b, 0),
    tools: Object.entries(s.tools).sort((a, b) => b[1] - a[1]),
    filesTouched: s.filesTouched,
    subagents: s.subagents ?? 0,
    usd: s.unpricedTokens > 0 && !s.usd ? null : s.usd,
    unpricedTokens: s.unpricedTokens ?? 0,
  };
}

function safeList(dir) { try { return readdirSync(dir); } catch { return []; } }
function newest(files) {
  return files.map((f) => [f, statSync(f).mtimeMs]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
function walk(dir) {
  const out = [];
  for (const name of safeList(dir)) {
    const p = join(dir, name);
    try { statSync(p).isDirectory() ? out.push(...walk(p)) : out.push(p); } catch { /* ignore */ }
  }
  return out;
}

// Session parsers for Claude Code and Codex transcripts.
// Both return the same normalized shape consumed by the card renderer.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

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

export function parseClaude(file) {
  const rows = readJsonl(file);
  const stamps = [];
  const events = [];
  const seen = new Set();
  const tools = {};
  let inp = 0, out = 0, cr = 0, cw = 0, prompts = 0, model = "", title = "", firstPrompt = "", cwd = "", branch = "";
  const files = new Set();

  for (const r of rows) {
    if (r.timestamp) stamps.push(+new Date(r.timestamp));
    if (r.type === "custom-title" && r.customTitle) title = r.customTitle;
    if (r.type === "summary" && r.summary && !title) title = r.summary;
    cwd ||= r.cwd || "";
    branch ||= r.gitBranch || "";

    if (r.type === "user" && !r.isMeta && !r.isSidechain) {
      const c = r.message?.content;
      const text = typeof c === "string" ? c : Array.isArray(c) ? c.filter((b) => b.type === "text").map((b) => b.text).join("\n") : "";
      const isToolResult = Array.isArray(c) && c.some((b) => b.type === "tool_result");
      if (!isToolResult && isHumanText(text)) { prompts++; firstPrompt ||= text; }
    }

    if (r.type === "assistant" && r.message) {
      const m = r.message;
      if (m.model && m.model !== "<synthetic>") model = m.model;
      for (const b of m.content ?? []) {
        if (b.type !== "tool_use") continue;
        tools[b.name] = (tools[b.name] ?? 0) + 1;
        if (b.input?.file_path && /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(b.name)) files.add(b.input.file_path);
      }
      // One API response is split over several lines that repeat the same usage.
      const key = m.id ?? r.requestId ?? r.uuid;
      if (seen.has(key)) continue;
      seen.add(key);
      const u = m.usage ?? {};
      inp += u.input_tokens ?? 0;
      out += u.output_tokens ?? 0;
      cr += u.cache_read_input_tokens ?? 0;
      cw += u.cache_creation_input_tokens ?? 0;
      if (r.timestamp) events.push([+new Date(r.timestamp), (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)]);
    }
  }

  return finish({
    agent: "claude", id: basename(file, ".jsonl"), title, firstPrompt, cwd, branch, model,
    tokens: { input: inp, output: out, cacheRead: cr, cacheWrite: cw },
    prompts, tools, filesTouched: files.size, stamps, events,
  });
}

/* ---------------- Codex ---------------- */

export function findCodexSession({ id, cwd }) {
  const root = join(homedir(), ".codex", "sessions");
  const all = walk(root).filter((f) => f.endsWith(".jsonl"));
  if (id) return all.find((f) => f.includes(id)) ?? null;
  // newest rollout whose session_meta cwd matches the current directory
  const sorted = all.map((f) => [f, statSync(f).mtimeMs]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  for (const f of sorted.slice(0, 200)) {
    const head = readFileSync(f, "utf8").slice(0, 20000);
    const m = head.match(/"cwd"\s*:\s*"([^"]+)"/);
    if (m && m[1] === cwd) return f;
  }
  return sorted[0] ?? null;
}

export function parseCodex(file) {
  const rows = readJsonl(file);
  const stamps = [];
  const events = [];
  const tools = {};
  let id = "", cwd = "", branch = "", model = "", prompts = 0, firstPrompt = "", title = "";
  let last = null, prevTotal = 0;

  for (const r of rows) {
    if (r.timestamp) stamps.push(+new Date(r.timestamp));
    const p = r.payload ?? {};
    if (r.type === "session_meta") { id ||= p.id; cwd ||= p.cwd; branch ||= p.git?.branch ?? ""; }
    if (r.type === "turn_context") { model = p.model || model; cwd ||= p.cwd; }
    if (r.type === "event_msg" && p.type === "user_message" && isHumanText(p.message)) { prompts++; firstPrompt ||= p.message; }
    if (r.type === "event_msg" && p.type === "thread_name_updated" && p.thread_name) title = p.thread_name;
    if (r.type === "response_item" && (p.type === "function_call" || p.type === "custom_tool_call" || p.type === "local_shell_call")) {
      const n = p.name ?? p.type;
      tools[n] = (tools[n] ?? 0) + 1;
    }
    if (r.type === "event_msg" && p.type === "token_count" && p.info?.total_token_usage) {
      last = p.info.total_token_usage;
      const total = last.total_tokens ?? 0;
      if (r.timestamp && total > prevTotal) events.push([+new Date(r.timestamp), total - prevTotal]);
      prevTotal = Math.max(prevTotal, total);
    }
  }
  // Older rollouts without user_message events: count real user messages instead.
  if (!prompts) {
    for (const r of rows) {
      const p = r.payload ?? {};
      if (r.type === "response_item" && p.type === "message" && p.role === "user") {
        const text = (p.content ?? []).map((c) => c.text ?? "").join("\n");
        if (isHumanText(text)) { prompts++; firstPrompt ||= text; }
      }
    }
  }

  const cached = last?.cached_input_tokens ?? 0;
  return finish({
    agent: "codex", id: id || basename(file, ".jsonl"), title, firstPrompt, cwd, branch, model,
    tokens: {
      input: Math.max(0, (last?.input_tokens ?? 0) - cached),
      output: last?.output_tokens ?? 0,
      cacheRead: cached,
      cacheWrite: last?.cache_write_input_tokens ?? 0,
    },
    prompts, tools, filesTouched: null, stamps, events,
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

#!/usr/bin/env node
// sesh: turn one coding-agent session into a 1080x1920 story card.
import { writeFileSync, readFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { homedir, tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { findClaudeSession, parseClaude, findCodexSession, parseCodex } from "./parse.mjs";
import { renderCard, compact, clock, money } from "./card.mjs";

const HELP = `sesh: share one coding-agent session as a story card

Usage: sesh [options]

  --agent <claude|codex>   which transcript to read (default: auto-detect)
  --session <id|path>      session id or .jsonl path (default: current or latest in this folder)
  --photo <path>           background photo (jpg, png, webp). Default: the image
                           attached to the prompt that ran sesh, if any
  --no-photo               ignore any attached image
  --out <path>             output .png (default: ~/sesh/<date>-<id>.png)
  --cwd <dir>              project folder to look up (default: current directory)
  --html                   also keep the .html next to the .png
  --json                   print the parsed stats as JSON and exit
  -h, --help               show this help
`;

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--html" || a === "--json") o[a.slice(2)] = true;
    else if (a === "--no-photo") o.noPhoto = true;
    else if (a.startsWith("--")) { o[a.slice(2)] = argv[++i]; }
  }
  return o;
}

function detectAgent() {
  if (process.env.CLAUDE_SESSION_ID || process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT) return "claude";
  if (Object.keys(process.env).some((k) => k.startsWith("CODEX_"))) return "codex";
  return null;
}

function load(o) {
  const cwd = resolve(o.cwd ?? process.cwd());
  if (o.session !== undefined && !String(o.session).trim() || /^\$\{.*\}$/.test(o.session ?? "")) delete o.session; // unexpanded placeholder
  const asPath = o.session && o.session.endsWith(".jsonl") && existsSync(o.session) ? resolve(o.session) : null;
  let agent = o.agent ?? (asPath ? (asPath.includes(`${join(".codex", "sessions")}`) ? "codex" : "claude") : detectAgent());
  const id = asPath ? null : (o.session ?? (agent === "claude" ? process.env.CLAUDE_SESSION_ID : process.env.CODEX_THREAD_ID));

  const tryClaude = () => asPath ?? findClaudeSession({ id, cwd });
  const tryCodex = () => asPath ?? findCodexSession({ id, cwd });

  let file = null;
  if (agent === "claude") file = tryClaude();
  else if (agent === "codex") file = tryCodex();
  else { // unknown: prefer whichever has a session for this folder
    file = findClaudeSession({ cwd });
    agent = file ? "claude" : "codex";
    file ??= findCodexSession({ cwd });
  }
  if (!file) throw new Error(`No ${agent ?? ""} session found for ${cwd}. Pass --session <id|path>.`);
  return agent === "codex" ? parseCodex(file) : parseClaude(file);
}

function photoUri(p) {
  const path = resolve(p.replace(/^~(?=\/)/, homedir()));
  const mime = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[extname(path).toLowerCase()];
  if (!mime) throw new Error(`Unsupported photo type: ${path} (use jpg, png or webp)`);
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

function findBrowser() {
  const c = [
    process.env.SESH_BROWSER, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  return c.find((p) => existsSync(p)) ?? null;
}

function screenshot(html, png) {
  const browser = findBrowser();
  if (!browser) return false;
  const dir = mkdtempSync(join(tmpdir(), "sesh-"));
  const page = join(dir, "card.html");
  writeFileSync(page, html);
  try {
    execFileSync(browser, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
      `--user-data-dir=${join(dir, "profile")}`, "--force-device-scale-factor=1",
      "--window-size=1080,1920", "--virtual-time-budget=6000", `--screenshot=${png}`, `file://${page}`,
    ], { stdio: "ignore", timeout: 60000 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return existsSync(png);
}

function main() {
  const o = args(process.argv.slice(2));
  if (o.help) { process.stdout.write(HELP); return; }

  const s = load(o);
  if (o.json) { console.log(JSON.stringify({ ...s, photo: s.photo ? "attached" : null }, null, 2)); return; }

  const photo = o.noPhoto ? null : o.photo ? photoUri(o.photo) : s.photo;
  const html = renderCard(s, { photo });
  const d = s.start;
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const out = resolve((o.out ?? join(homedir(), "sesh", `${stamp}-${s.id.slice(0, 8)}.png`)).replace(/^~(?=\/)/, homedir()));
  mkdirSync(join(out, ".."), { recursive: true });

  const htmlPath = out.replace(/\.png$/i, "") + ".html";
  const ok = screenshot(html, out);
  if (o.html || !ok) writeFileSync(htmlPath, html);

  const [tv, tu] = compact(s.tokens.total);
  console.log(`sesh  ${s.title}`);
  console.log(`      ${tv}${tu} tokens · ${clock(s.movingMs)} moving · ${s.prompts} prompts · ${s.toolCalls} tool calls · ${money(s)} API equiv · ${s.model}`);
  if (ok) console.log(`card  ${out}`);
  else console.log(`card  no Chrome/Chromium/Edge found. HTML saved: ${htmlPath}\n      set SESH_BROWSER=/path/to/chrome to render PNG`);
}

try { main(); } catch (e) { console.error(`sesh: ${e.message}`); process.exit(1); }

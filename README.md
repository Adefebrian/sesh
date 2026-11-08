<div align="center">

<img src="docs/sample-photo.jpg" alt="sesh story card with a background photo" width="300">&nbsp;&nbsp;&nbsp;<img src="docs/sample-plain.jpg" alt="sesh story card without a photo" width="300">

# `SESH_`

**One session. One card. Straight to your story.**

`sesh` reads the transcript of a single Claude Code or Codex session and renders it as a 1080×1920 story card: tokens burned, moving time, output, prompts, tool calls and a token-pace chart.

`CLAUDE CODE` · `CODEX` · `NODE 18+` · `ZERO DEPENDENCIES` · `MIT`

</div>

---

## `> BOOT`

```text
$ /sesh --photo ~/desk.jpg

sesh  Claude session activity tracker
      10.1M tokens · 0:20 moving · 10 prompts · 82 tool calls · claude-opus-5-5
card  ~/sesh/20261108-2d3959ca.png
```

- **One session, not your lifetime total.** The card covers the session you are in, like a single run.
- **Local only.** Stats come from the transcript files already on your machine. Nothing is uploaded.
- **Real numbers.** Every value on the card is computed from the transcript. No estimates, no filler.
- **Optional photo.** Add your own background, or ship the plain card with the token count as the hero.

## `> INSTALL`

### Claude Code

```bash
claude plugin marketplace add Adefebrian/sesh
claude plugin install sesh@sesh
```

Or inside a session: `/plugin marketplace add Adefebrian/sesh`, then `/plugin install sesh@sesh`.

### Codex

```bash
codex plugin marketplace add Adefebrian/sesh
codex plugin add sesh@sesh
```

The plugin ships a `sesh` skill. Ask Codex to "sesh this session" or "make a story card of this session".

### Standalone CLI

```bash
npx github:Adefebrian/sesh --help
```

### Requirements

| Need | Why |
|---|---|
| Node.js 18 or newer | runs the parser and renderer |
| Chrome, Chromium, Edge or Brave | renders the PNG in headless mode |

If no browser is found, `sesh` saves the card as HTML and tells you. Point it at any Chromium-based binary with `SESH_BROWSER=/path/to/chrome`.

## `> RUN`

| Where | Command |
|---|---|
| Claude Code | `/sesh` |
| Claude Code with photo | `/sesh --photo ~/Pictures/desk.jpg` |
| Codex | ask: *"sesh this session"* |
| Terminal | `sesh --agent claude` or `sesh --agent codex` |

### Flags

| Flag | Default | Description |
|---|---|---|
| `--agent <claude\|codex>` | auto | Which transcript to read |
| `--session <id\|path>` | current folder's latest | A session id or a `.jsonl` transcript path |
| `--photo <path>` | none | Background photo: jpg, png or webp |
| `--out <file.png>` | `~/sesh/<date>-<id>.png` | Where to write the card |
| `--cwd <dir>` | current directory | Project folder to look up |
| `--html` | off | Keep the HTML next to the PNG |
| `--json` | off | Print parsed stats as JSON and exit |

## `> TELEMETRY`

What lands on the card and where it comes from.

| Field | Meaning | Claude Code source | Codex source |
|---|---|---|---|
| **Tokens** | input + output + cache read + cache write, subagents included | `message.usage`, once per API response, plus `<session>/subagents/*.jsonl` | last `token_count.total_token_usage` of the session and every subagent thread it spawned |
| **Moving** | active time; gaps over 5 min count as idle | line timestamps | line timestamps |
| **Elapsed** | first to last event (plain card only) | line timestamps | line timestamps |
| **Output** | tokens the model wrote | `usage.output_tokens` | `output_tokens` |
| **Prompts** | messages you typed, slash commands included, `/sesh` excluded | main transcript only; subagent instructions are not counted | `user_message` events, else real user messages |
| **Tool calls** | every tool invocation, subagents included | `tool_use` blocks | `function_call` items |
| **Cache hit** | share of prompt tokens served from cache | cache read ÷ (input + cache read + cache write) | cached ÷ input |
| **Chart** | tokens per bucket over moving time, peak in yellow | per response | per `token_count` delta |
| **Title** | session title, else your first prompt | `custom-title` / `summary` | thread name / first prompt |

Transcripts are read from `~/.claude/projects/` and `~/.codex/sessions/`.

### Which session

- **Claude Code:** `/sesh` passes the id of the session you are in, so a second session running in the same folder is never picked by mistake.
- **Codex:** the newest top-level session started in the current folder. Subagent threads are never picked on their own; their work is rolled into the session that spawned them.
- **Anywhere:** `--session <id|path>` picks one explicitly.

## `> ANATOMY`

```text
sesh/
├── .claude-plugin/        Claude Code plugin + marketplace manifest
├── .codex-plugin/         Codex plugin manifest
├── commands/sesh.md       /sesh slash command (Claude Code)
├── skills/sesh/
│   ├── SKILL.md           shared skill for Claude Code and Codex
│   └── scripts/
│       ├── sesh.mjs       CLI entry
│       ├── parse.mjs      Claude Code + Codex transcript parsers
│       └── card.mjs       1080×1920 card template
└── bin/sesh.mjs           npx entry
```

## `> PRIVACY`

The card shows the project folder name, git branch, session title and model. Check the card before you post it if any of those are private. Use `--session` to pick a different session or edit the title in your agent before rendering.

## `> LICENSE`

MIT © Ade Febrian. Sample background photo from [Unsplash](https://unsplash.com) (Unsplash License).

<div align="center"><sub><code>SESH_</code> · end of transmission</sub></div>

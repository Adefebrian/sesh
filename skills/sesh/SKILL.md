---
name: sesh
description: Turn the current coding-agent session (Claude Code or Codex) into a 1080x1920 story card PNG with tokens, moving time, output, prompts, tool calls and a token-pace chart, ready to share on Instagram. Use when the user asks to share, recap, flex or "sesh" their session, or wants session stats as an image.
---

# sesh

Render one session as a story card.

## Run

The CLI lives next to this file. Run it with Node 18+ from the user's project folder:

```bash
node "<this skill folder>/scripts/sesh.mjs" --agent <claude|codex>
```

- In Claude Code pass `--agent claude`. In Codex pass `--agent codex`.
- With no `--session`, sesh picks the newest session recorded for the current folder, which is the one running now.
- Add `--photo <path>` only when the user gives a photo. Without one, sesh renders the plain dark card.
- Pass through any other flags the user asks for: `--session <id|path>`, `--out <file.png>`, `--html`, `--json`.

## After it runs

1. Report the summary line it prints (title, tokens, moving time, prompts, tool calls, model).
2. Give the PNG path from the `card` line. If your host can show or send files, show the image.
3. If it says no browser was found, tell the user to install Chrome, Chromium or Edge, or to set `SESH_BROWSER` to a Chromium-based browser binary.

Do not invent numbers. Everything on the card comes from the local transcript.

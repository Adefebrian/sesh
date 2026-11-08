---
description: Render this session as a 1080x1920 story card (tokens, moving time, prompts, tool calls)
argument-hint: "[--photo path] [--session id] [--out file.png]"
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/sesh/scripts/sesh.mjs" --agent claude $ARGUMENTS
```

Then report the summary line and the PNG path from the `card` line. Do not add numbers that the command did not print. If it reports no browser, tell the user to install Chrome, Chromium or Edge, or set `SESH_BROWSER`.

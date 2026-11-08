---
description: Turn this session into a story card. Attach a photo to use it as the background.
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/sesh/scripts/sesh.mjs" --agent claude --session "${CLAUDE_SESSION_ID}" $ARGUMENTS
```

An image the user attached to this message is picked up automatically as the background. Do not pass a photo yourself.

Then report the summary line and the PNG path from the `card` line, and show the image if you can. Do not add numbers that the command did not print. If it reports no browser, tell the user to install Chrome, Chromium or Edge, or set `SESH_BROWSER`.

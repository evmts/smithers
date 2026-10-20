---
"@smthrs/ui": minor
---

Adds `TerminalFrame` at `@smthrs/ui/adapters/terminal-frame`: xterm.js runs in an opaque-origin frame
(`sandbox="allow-scripts"`, `srcdoc`) whose CSP pins the generated frame runtime by hash and allows no network, while
the page holds the connection.

- The page answers one `terminal/initialize`, from its own frame with its mount's nonce, and transfers a
  `MessagePort`. Output goes in as transferred bytes, with `theme`, `readOnly` and focus; input, size, ⌘K and Ctrl+K,
  and clicked web links come out.
- `readOnly` sets xterm's `disableStdin`, and neither the frame nor the page passes input on.
- A link opens only from the person's click and activation, through `onLink` or a `noopener,noreferrer` window. The
  frame loads no clipboard addon and follows no link itself.
- The frame mounts only while it is near the screen. `scripts/build-views.mjs` generates its runtime, and `--check`
  covers it.

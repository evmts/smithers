---
title: "@smthrs/terminal-frame"
description: "A shell's terminal in a sandboxed frame: xterm.js runs at an opaque origin with no network while the page holds the connection."
sidebar:
  order: 0
---

`TerminalFrame` shows a live shell. xterm.js and its fit addon run inside an
`<iframe sandbox="allow-scripts">` whose content security policy admits only
the frame's own runtime, pinned by hash, and no network. Your page keeps the
connection to the shell and talks to the frame through one `MessagePort`.

Use it for any shell whose output you don't control. A shell's escape
sequences and links stay inside the frame; a link reaches your page only after
the person clicks it.

`@smthrs/ui`'s `Terminal` adapter renders xterm.js in your page instead. Use it
only for output you trust, such as a recorded session you produced.

## Pages

- [Frame a shell](./guides/frame-a-shell.md)
- [API reference](./api.md)

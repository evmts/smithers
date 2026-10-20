---
"@smthrs/platform-browser": minor
---

Adds `TerminalSocket`, the reconnecting WebSocket a page holds to a terminal that speaks `TerminalProtocol` from
`@smthrs/sandbox`. `connect(url, { onOutput })` returns `send`, `resize` and a `status` stream (`Connecting`, `Open`,
`Offline`, `Ended`, `Closed`) and dials in a fiber the scope owns.

- Keystrokes go out only while open with write access, in frames of at most 64 KiB, and are dropped otherwise, never
  queued.
- Only the latest size is kept; it goes out on `ready` with write access and again when it changes.
- Final closes and `ended` never redial. Other closes redial on Effect's clock after 1 s, doubling to 30 s, at most 10
  times in a row; `ready` resets the count.
- The socket comes from Effect's `Socket.WebSocketConstructor`; `TerminalSocket.layerWebSocket` provides the browser's
  own.

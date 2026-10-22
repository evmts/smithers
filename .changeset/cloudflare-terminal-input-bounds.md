---
"@smthrs/platform-cloudflare": patch
---

Validate terminal frames before buffering and cap retained input at 1 MiB across
both queues and the pending write. Charge each frame 64 bytes plus its binary
byte length, bounding empty binary and resize frames too. Overflow closes the socket with code 1011 and reason
`Terminal input buffer full`. Socket listeners are removed on every exit;
interruption closes the socket with reason `Terminal interrupted`.

Structural `ContainerTerminal.Socket` implementations must now provide
`removeEventListener`, as server WebSockets already do.

---
"@smthrs/sandbox": minor
---

Adds `TerminalProtocol`: the pure wire protocol between a browser terminal and the host that attaches it to a sandbox
shell, one WebSocket per viewer. Binary frames carry bytes; JSON text frames carry a writer's `resize` and the host's
`ready` and `ended`; frames are capped at 64 KiB; `CloseCode` and `isFinal` say which closes end the connection, and
`reconnectDelay` how long to wait before the next attempt.

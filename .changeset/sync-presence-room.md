---
"@smthrs/sync": minor
---

Adds presence rooms: who is on a page, and where, live, over one WebSocket per page.

- `PresenceProtocol` is the pure wire. A page sends `{ type: "state", state }`; the room sends
  `{ type: "roster", self, participants }` in join order after every change. A state holds at most 1 KiB and a frame
  2 KiB of UTF-8, a room 256 connections. `CloseCode`, `isFinal` and `reconnectDelay` say which closes end the
  connection and how long to wait before the next attempt.
- `PresenceRoom` is the host side: `join`, `receive`, `leave`, `close`, `evict` and `connections` over a structural
  socket host, so a Cloudflare Durable Object passes its WebSockets and `state.getWebSockets()` in as they are. The room
  keeps every connection in its socket's attachment and nothing in memory, so it survives hibernation. A send to a
  closed socket drops that socket instead of failing the room. Metrics and spans carry ids and counts only.
- `PresenceSocket.connect(url)` is the page side, over Effect's `Socket.WebSocketConstructor`. It opens on the first
  roster, keeps only the latest state and resends it after every reconnect, and redials on Effect's clock after 1 s,
  doubling to 30 s, at most 10 times in a row.

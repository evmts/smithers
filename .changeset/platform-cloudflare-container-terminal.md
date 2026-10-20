---
"@smthrs/platform-cloudflare": minor
---

Adds a container Durable Object's wake and browser terminal:

- `SandboxObject.wake(container, { intercepts, inactivityTimeoutMs? })`: starts the container with
  `enableInternet: false` when it is not running, re-arms its inactivity timeout (30 minutes by default), and
  registers each `{ host, fetcher }` outbound HTTP intercept, on every call. It answers `started` or `running`.
- `ContainerTerminal.ensureSession(container, { name, user, cwd })`: creates the tmux session named by a terminal's
  UUID as a non-root user, unless it already runs, with argument vectors and no shell.
- `ContainerTerminal.attach(container, socket, { name, user, access, cols, rows })`: bridges an accepted server
  WebSocket to its own tmux client over `@smthrs/sandbox`'s `TerminalProtocol`. A writer types and resizes; a
  reader's client is `read-only,ignore-size` with no stdin, and every byte and resize it sends is dropped. Malformed
  frames close with 1003, frames over 64 KiB with 1009, an ended session with `ended` and 1000; a viewer that leaves
  kills only its own tmux client, so a reload reattaches to the same shell.

Both take the container as a structural slice of an Effect container client, so an Alchemy Durable Object's container
handle passes in as is. Telemetry carries ids, access, outcomes, close codes and byte counts, never terminal content;
no metric attribute holds an id. `@smthrs/sandbox` is now a dependency.

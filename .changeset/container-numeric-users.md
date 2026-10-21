---
"@smthrs/platform-cloudflare": minor
---

Runs container commands the way a deployed container requires, and keeps a
container alive across a Durable Object restart.

- `ContainerTerminal` and `ContainerSession` take the user as a numeric
  `uid:gid`, such as `1000:2000`. A deployed container's `exec` refuses a user
  name and runs a bare `uid` as root, while local Docker accepts both, so names
  passed in development and failed in production. `ContainerTerminal` refuses
  anything else, and uid 0, with `InvalidSession`; `ContainerSession` fails
  every command with `ProviderError` code `spawn_error` before it reaches the
  container. `ContainerTerminal.isSessionUser` checks a value.
- `ContainerTerminal.ensureSession` and `attach` take `env`: the variables tmux
  and its shells run under, since a command inherits only `PATH` from the
  image. `TERM` stays `xterm-256color`.
- `SandboxObject.wake` takes `instance`, the instance type a stopped container
  starts on; without it Cloudflare starts `lite` (1/16 vCPU, 256 MiB).
- `SandboxObject.rearm` re-arms a running container's inactivity timeout and
  starts nothing. A restarted object has none, and Cloudflare stops its
  container soon after the object goes idle; call it in the constructor and on
  each use that doesn't wake. Counted in `smithers_cloudflare_sandbox_rearms`.

```ts
yield* SandboxObject.wake(box, { intercepts, instance: "standard-1" })
yield* ContainerTerminal.ensureSession(box, {
  name: terminalId,
  user: "1000:2000",
  cwd: "/workspace",
  env: { HOME: "/home/smithers", USER: "smithers", LANG: "C.UTF-8" }
})
```

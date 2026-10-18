---
title: Burn down the known host access list
status: todo
area: sdk
owner: unassigned; listed by the sandbox host-boundary agent's report (02:26:57 on 2026-10-20); the lead queued it (02:27)
updated: 2026-10-20
links: [flows-root-platform-neutral.md, host-agnostic-flows.md, library-catalog.md, code-reviews.md, agent-root-browser-safe.md, integrations-browser-safe-root.md, web-standard-globals-rule.md, ../../../../docs/libraries.md, ../../../../AGENTS.md]
---

## What

Empty `KNOWN_HOST_ACCESS` in `packages/repo-targets/browser/browser-contract.mjs`. Each of its 10 library modules reads the host directly. Move each read behind an injected Effect service, with Node and Bun layers in `@smthrs/platform-node` and `@smthrs/platform-bun` and a portable default or no-op elsewhere, the way `@smthrs/sandbox`'s `GarbageCollector` now works ([flows root](flows-root-platform-neutral.md)).

```
module                                                     reaches                               for
same pattern as finding 5 (getBuiltinModule)
  model        src/internal/WireTrace.ts                   process.env, node:fs                  opt-in SMITHERS_WIRE_TRACE file
  engine-store src/internal/HostReflection.ts              node:util/types                       proxy and native-error detection
  engine       src/internal/Diagnostic.ts                  node:util                             proxy detection
ambient process reads
  run-store    src/Ownership.ts                            process.kill(pid, 0)                  sameHostPidProbe
  engine-store src/OwnerIdentity.ts                        process.pid                           the run owner's identity
  kernel       src/ChildProcessSpawner.ts                  process.platform, process.env         a child's environment
  integrations src/Environment.ts                          process.env                           configuration
  sandbox      ContainerSandbox/existing.ts,               process.env                           a command's environment
               DirectorySandbox/make.ts,
               RemoteChildProcessSpawner/layer.ts
```

## Why

Root `AGENTS.md`: every library except the host packages "must import and run in a browser, a Cloudflare Worker, Node and Bun", and platform code reaches it "as injected Effect services and layers". A package that breaks this has a bug.

The browser gate didn't see these until 2026-10-20. The sandbox agent tightened `HiddenHostAccess` so that a non-host workspace module fails on any `getBuiltinModule` call, any read of the `process`, `Bun` or `Deno` globals, and any `node:` or `bun:` string. These 10 modules were already there, so they went on a list the gate accepts. The gate fails when a listed module stops reaching the host, so the list can only shrink.

## State

- 02:26:57 on 2026-10-20: the sandbox host-boundary agent's report ([code reviews](code-reviews.md), finding 5). It fixed `@smthrs/sandbox`'s garbage collector and listed the rest instead of fixing them:
  - **WireTrace:** a host layer would make `platform-node` depend on `@smthrs/model`.
  - **HostReflection and Diagnostic:** called synchronously across engine code that other agents were editing.
  - "Your call whether to take these on."
- 02:27:02: the lead to Will: "The stricter gate found 10 more modules that read host APIs directly. They're on a known list that the gate only lets shrink. Fixing them is queued, because three of them sit in engine code other agents are editing right now."
- `docs/libraries.md` lists the same 10 under "Known violations: a library module reaches the host at run time" ([library catalog](library-catalog.md)).
- Not assigned. The [agent root](agent-root-browser-safe.md) agent touches `kernel` (`ResolveHost` and an environment accessor) but not `ChildProcessSpawner.ts`.

- 03:15:18 on 2026-10-20: the [agent root](agent-root-browser-safe.md) agent reported done. std reads `process.env` through the kernel's newly exported `ambientEnvironment()`, so the list didn't grow. The agent-root half of this item's precondition is met; the wiring step is still running.

## Next

From 03:15 on 2026-10-20: the agent-root fix is reported (uncommitted); assign this after the wiring step reports. The kernel's new `ambientEnvironment()` is a candidate starting point for step 1 below.

Until 03:15 on 2026-10-20 the next step was: assign it after the wiring step and the agent-root fix land, since both touch engine and kernel code. Suggested order:
1. The seven `process` reads: one injected host-environment service (process id, platform, environment, liveness probe), with Node and Bun layers.
2. `HostReflection` and `Diagnostic`: proxy detection that needs no host module, or a synchronous host service read once at layer build.
3. `WireTrace`: a trace sink service that `platform-node` provides, without a new `platform-node` → `model` dependency.

Proof for each module: its `KNOWN_HOST_ACCESS` entry is removed, the gate passes for a browser and a Worker, its package stays at 100% coverage, and its catalog row is deleted.

## Questions for Will

None. Open for the lead: which proxy-detection approach for `HostReflection` and `Diagnostic`, a portable check or a host service? Best guess: a portable check, since a synchronous service adds a layer to every engine call site.

---
title: "Measure a sandbox command's overhead"
description: "The benchmark that times a run's call of a sandbox command on Durable Objects over a real Postgres: its method, its numbers before and after the step path, and what each stretch costs."
---

A run on Cloudflare calls a sandbox command the way the TODO agent's `run`
tool does: a step executes the command's `SandboxCommand` job
(`@smthrs/sandbox`). The benchmark measures how long that call takes beyond
the command's own run time.

## Method

`test/CommandLatency.test.ts` runs a run of `warm` steps, then one call, on
in-memory Durable Objects (`test/fixtures/Objects.ts`): each execution its own
object, a fresh runtime (`CloudflareRuntime.layer`) for every alarm, alarms
fired when due, one at a time, as Cloudflare fires them. The engine's store
is a real Postgres, behind a proxy that delays every packet
(`@smthrs/database/test/SlowNetwork`). One statement costs one round trip.
The default, 25 ms, is what production's objects paid through Hyperdrive on
2026-10-22: 5 s for the 198 statements of a job's first two steps. The box is
in memory: its command exits a set time after it starts, and a read that may
wait answers at the exit, as `SandboxTools.observe` does. Overhead is from
the step's call to its answer, less the command's own time.

```sh
# The suite's check: a command that exits at once answers within 5 s.
pnpm vitest run test/CommandLatency.test.ts
# The matrix: execute and run, a command that exits at once and one that runs 30 s.
COMMAND_LATENCY_BENCH=1 pnpm vitest run test/CommandLatency.test.ts
# Each stretch's statements too.
COMMAND_LATENCY_BENCH=1 COMMAND_LATENCY_TRACE=1 pnpm vitest run test/CommandLatency.test.ts
```

Each case prints a `command-latency` line: the overhead, each object's
alarms, and each execution's creation, claim and settlement relative to the
call. With the trace it prints `command-latency-stretches`: the statements
between consecutive marks.

## Numbers

25 ms round trips, 20 steps before the call, on a Latitude host, 2026-10-22.
"Before" is the engine at the queue tip 272f7bdb (the call made the job's
execution with `execute`); "after" is with the step path (`run`, waiting as
long as the command may run and the drive's budget allows), the hosted
engine's recovery of its own flow's wakes alone (main's 30a86a48), routing in
one read transaction, and the drive's hold for a wake due soon.

| Call                                                       | Before | After     |
| ---------------------------------------------------------- | ------ | --------- |
| A command that exits at once (`git status`)                | 47.2 s | **0.1 s** |
| A command that runs 30 s                                   | 46.9 s | **0.1 s** |
| A command that outlives its drive's budget (a 10 s budget) | 46.9 s | 41.4 s    |

The last row is the only one that makes the job's execution and parks the run.
Where its time goes, before and after:

| Stretch                                                | Before          | After           |
| ------------------------------------------------------ | --------------- | --------------- |
| The call parks the run, its alarm routes the job       | 124 statements  | 120 statements  |
| The job's object builds its runtime and claims the job | 225 statements  | 77 statements   |
| The job's first two steps and its handoff              | 209 statements  | 209 statements  |
| A probe round's object builds its runtime and claims   | 225 statements  | 77 statements   |
| The round probes and collects                          | 254 statements  | 254 statements  |
| The run's object wakes, replays 20 steps, and answers  | 1170 statements | 1026 statements |

A command that ends while the step waits makes none of these: the step starts
it, reads it with observes that wait for its exit, and collects it, in a few
statements (whether the job already has an execution). The run never parks,
so it never replays.

## Limits

- The box is in memory, so the numbers leave out what a container costs: an
  exec of each script, waking a sleeping machine, and saving the working copy
  on collect, which stages from the checkout's own index
  (`SandboxTools.checkpoint`).
- The objects run one alarm at a time and build a runtime in milliseconds
  with this suite's few flows. A Worker that registers more flows builds
  slower: production's took 3 to 9 s before a hosted engine recovered its own
  flow's wakes alone.
- A command that outlives its drive's budget still costs a resumed run's
  replay, which grows with its journal: about 50 statements for each step
  replayed.

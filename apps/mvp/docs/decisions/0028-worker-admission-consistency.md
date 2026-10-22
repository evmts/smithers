# 0028: Worker admission consistency

Status: implemented (2026-10-21), addressing Will's confirmed worker findings.

A human wait remains streaming and writable, so it continues to block later turns even after its host lease expires. This supersedes 0015's permission to start another answer alongside a quiet human wait and clarifies 0022's abandonment exemption. A resumed wait settles before its successor receives history.

Question allocation and answer admission share the conversation row lock. Asking acquires it before allocating positions and retains it through commit, so a later visible pair cannot hide an earlier uncommitted predecessor. Independent conversations retain separate locks; existing paired positions and retry identity stay unchanged.

Steer admission resolves notification identity and checks run state in the same journal writer transaction. An existing admission returns its receipt even after completion. A new admission rolls back when the run or agent has ended. Inspection uses the writer's SQL service, so a read-only connection is unnecessary for steering. The catalogued `@smthrs/notifications` queue and `@smthrs/flows` journal/durable writer supply identity, rollback and serialization; no second queue or runtime is introduced. Existing route logs, spans and counters retain taken, existing and refusal outcomes without recording content.

The edge throttle parses mapped IPv6 addresses into numeric groups before selecting the IPv4 /24. Dotted, hexadecimal, compressed and expanded forms have one key.

Regression evidence is in `Throttle.test.ts`, `Answers.test.ts`, `Messages.test.ts` and `RemoteRuns.test.ts`, using real Postgres/engine operations and a delayed Effect writer layer. No persisted schema changes are required.

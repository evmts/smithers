# 0002 appendix: Opus and Sol designs compared

The two designs were written independently, then Opus merged them into [0002](0002-local-first.md). Each row names the point, each design's position and the final call. Sol's claims that the final design adopts were checked against the TanStack and Electric sources, and the comparison notes where a claim didn't hold.

**Agreed** (Opus and Sol said the same thing; the final design keeps it):

| Point | Final |
|---|---|
| Local replica | Electric options wrapped in `persistedCollectionOptions` (OPFS SQLite) |
| Outbox | `@tanstack/offline-transactions`, IndexedDB, the library's own retries |
| App shell offline | service worker, assets only; `/api/*` network only. Offline restart needs one earlier visit |
| Write pattern | Electric's shared persistent optimistic state |
| Confirmation | `awaitTxId`; on a replay, check the row is already present (`get`) |
| Answer streaming | Postgres row updates through Electric; Durable Streams later, only on measured need, with Postgres still the truth |
| Server turns | each answer waits for the previous one to settle |
| Composer | never blocks |
| Multiplayer files | Yjs, Postgres-backed, through Electric shapes |

**Differed:**

| Point | Opus | Sol | Final | Why |
|---|---|---|---|---|
| Multi-tab outbox gap (followers online-only) | custom `LeaderElection` (documented option): steal on focus, queued failover | patch upstream for durable follower enqueue, a receipt and an archive; treat it as a delivery blocker | Opus, plus Sol's "never online-only" | Uses a documented extension point and ships now. A forked dependency is debt. Sol's rule closes the race Opus left open, so `transact` refuses rather than falling back. |
| Not-yet-leader or no-storage ask | online-only path; `Not sent` + Retry | never online-only; keep the text | Sol | An ask is accepted only into durable storage. |
| Durable receipt | none; the draft clears at once | `Saving` → `Queued`; the draft clears after the receipt | Sol's receipt (`admitted`), without a `Saving` state | Admission takes milliseconds, so the copy would only flicker. A failure keeps the text as `unsent` (`not_admitted`). |
| Where optimistic rows live | a separate in-memory `asking`, anti-joined | optimistic mutation; projection unspecified | Opus | TanStack layers optimistic rows as whole-row snapshots ([mutations.md]), so an overlay on `messages` would mask the streamed answer. |
| Refused-question record | persisted `unsent` collection (OPFS), upserted before `NonRetriableError` | archive in the same IndexedDB transaction through a custom `StorageAdapter` | Opus | Upsert-then-throw is at-least-once, with no adapter and no cross-store atomicity. |
| Dedupe record | `messages` primary key, compared | a command-receipts table, also for refusals, kept for the conversation's lifetime | Opus | A refusal is deterministic for the same body, so receipts duplicate the primary key. |
| Order key | `position` identity; FIFO single-flight per device | per-conversation counter under a lock, plus a causal predecessor chain | Opus now; the counter arrives with `conversations` | FIFO single-flight already keeps producer order, and there is one conversation today. |
| History scope | eager, one shape per conversation; delete on-demand and `keepOffset` | keep on-demand; cache pages with coverage and gaps; `Not downloaded` | Opus | TanStack: on-demand "is not yet a certified offline snapshot … a later launch must refetch" ([sqlite-persistence.md]). Coverage would be hand-rolled. |
| History bound per answer | history at answer start | sealed through its own question's sequence | Sol | Cheap, and exact under turns. |
| Answer generation and revision columns | not needed by the client | add them | not adopted here | HOST-PLAN's fence and attempt reset own this. The client is cadence-agnostic. |
| Status copy | `Offline`, `Offline · N`, `Queued`, `Sync failed`, `Not sent` | adds `Saving`, `Opening`, `Syncing · N queued`, `Paused`, `Smithers is answering`, `Not saved`, `Not downloaded`, `Update required` | Opus | Minimal text: blank-until-known replaces `Opening` and `Syncing`, and the pill says `Offline`. |
| Unknown vs empty history | not covered | distinguish them | Sol, with no copy | Never show an empty state before the first restore or snapshot. |
| Conflict UX | 409 id collision, forced by the harness | `Conflict` with `Keep mine` / `Use latest`, via a test-only mutable command | Opus now; Sol's UI arrives with the first mutable shared record | Chat asks are append-only. A test-only feature is invention. |
| Drafts | per tab, in memory | persisted per tab | Opus | YAGNI. The requirement covers sent questions, and a draft's tab identity doesn't survive a restart. |
| Cancel a queued question | not offered | needs an idempotent cancellation command | later, with `cancel` | Sol's unknown-outcome rule applies when it is built. |
| Back/forward cache | not covered | test it | Sol | Verified: the browser persistence README requires fresh connections after `pageshow` restores. The app reloads. |
| Status announcements | not covered | accessible status region | Sol | `aria-live="polite"`, announced once. |
| No-spinner proof | a `MutationObserver` sentinel; first-frame bench | hold remote requests open; input-to-projection p95 under 50 ms | both | Both are cheap and catch different regressions. |
| Extra e2e cases | E1–E8 | kill after enqueue; kill the leader with a follower ask; must-refetch keeps the cache | both | Added E9 and E10 and a must-refetch unit test. |
| Yjs integration | `@electric-sql/y-electric` package | "examples, not a finished package" | Opus | `@electric-sql/y-electric` 0.1.54 is published (2026-09-09). Sol's caution on convergence tests stands. |
| Dependency age | flagged: the set is one day old; land 10-25 | pin tarballs and validate | both | The 7-day rule applies, and so does tarball validation. |

[mutations.md]: https://github.com/TanStack/db/blob/main/docs/guides/mutations.md
[sqlite-persistence.md]: https://github.com/TanStack/db/blob/main/docs/guides/sqlite-persistence.md

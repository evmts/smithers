---
"@smthrs/integrations": minor
---

`UpsertComment` and `CheckRun` key their object by the running execution when the payload names no `key`, so a run
never takes over another run's sticky comment or check run.

- `key` is optional on `UpsertCommentPayload` and `CheckRunPayload`. Without it, the key is `GitHub.Actions.runKey`:
  `run:` and 32 hex of SHA-256 over the execution id, the same for every step of one run and never the id itself. Pass
  `key` only for a domain key chosen and recorded before the write.
- Both implementation versions move to v2 (`github/upsert-comment/v2`, `github/check-run/v2`).
- `runKey` dies with `Action.EffectKeyUnavailable` outside a flow execution.

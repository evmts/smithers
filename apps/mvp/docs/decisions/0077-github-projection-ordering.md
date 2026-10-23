# 0077: GitHub projection observation fences

Implementation decision, 2026-10-21, correcting the confirmed GitHub ordering and authorization bugs under the existing product rulings.

An absence observation can precede the first local row. Migration 0048 adds server-only per-item absence and complete-comment-list timestamps. Projection writers and fence writers share a Postgres transaction advisory lock. Fences advance monotonically; stale reads cannot insert missing rows behind them. Existing tombstones are carried forward and their stale pull projections removed.

Pull snapshots and commit replacements are atomic under the same lock. Identical content still advances observation timestamps. Merge attempt counts record attempts, not proof of a PUT. (The `merge_unknown` recovery flag this decision added is superseded: a merge now carries its key in its commit message and is found by it, docs/work/github-write-hardening.md; migration 0050 drops the flag.) GitHub success settles before projection, whose independent failure is observable.

Anonymous access checks current repository metadata through the existing Smithers GitHub client and read-token policy. Reconciliation admission runs in the Worker's scope; reconciliation itself remains a durable Smithers flow. Webhook metrics use bounded event categories and delivery receipts precede Apply admission.

The regression suites exercise real Postgres and Electric. GitHub failure injection uses the existing Effect HTTP service. No dependency, runtime, plugin interface, or client persistence schema is added.

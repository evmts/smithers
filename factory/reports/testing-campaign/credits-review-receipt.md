Local Astra fix and regression validation are complete for the single-account MinInt64 bug; not landed yet.

- Shared `normalize` rejects the unrepresentable opening debt before all public entry points reach a database.
- Regression failed before the fix; validation now covers DryRun/Import/Verify and real PostgreSQL replay/readback at MinInt64+1, MaxInt64, and zero.
- `SMITHERS_REQUIRE_DATABASE_TESTS=1 go test ./packages/backend/credits -count=1` passed against local PostgreSQL, 46.471s; `go vet` passed (Go 1.26.8).
- `claude -p --model fable` review resolved to `claude-fable-5-1`: no blocking findings. Removed redundant weaker regression and clarified fixture name. Adjacent debt accumulation uses PostgreSQL bigint arithmetic, which errors/rolls back on overflow.
- Separate report-total overflow discovered during review is #2295; Astra is fixing it.

Keep open for final reviewed revision, Cloud checks and normal stack/PR landing receipts.

`credits.ImportReport.tally` adds balances into int64 totals without overflow checks. For example `DryRun(at, []LegacyAccount{{SourceID:"a", BalanceNanos:math.MaxInt64}, {SourceID:"b", BalanceNanos:1}})` succeeds and reports negative `BalanceNanos` and `SealedNanos` (`math.MinInt64`) for two positive balances.

The issue also affects negative totals and disposition subtotals; ownership resolution may change the final grouping during import/verification. Preserve exact totals or return a clear overflow error without returning wrapped values. Review archive ordering/cancellation of sums and partial import receipts. Add unit boundary tests and real PostgreSQL integration regressions.

Discovered by Astra while fixing #2292 during #2290. Astra implementation and `claude -p --model fable` review required. Keep open until tested and landed with normal Cloud/stack receipts.

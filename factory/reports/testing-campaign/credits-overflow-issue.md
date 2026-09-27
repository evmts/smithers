`credits.DryRun` accepts a legacy account with `BalanceNanos = math.MinInt64`, but `importOne` negates that balance to represent opening debt. Negating the minimum int64 overflows, so the accepted archive cannot be imported correctly; `verifyOne` also negates the value.

Reproducer: call `DryRun` with a nonzero export time and `[]LegacyAccount{{SourceID: "minimum-debt", BalanceNanos: math.MinInt64}}`; it returns success. Normalization should reject balances whose positive debt magnitude cannot be represented while accepting the neighboring representable bound.

Discovered by the unit-test audit in #2290. Regression test and Astra fix in progress; user requires Fable review via `claude -p --model fable`, then focused/full-package validation. Do not close until verified and landed through the normal stack/Cloud workflow.

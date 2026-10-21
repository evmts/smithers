---
"@smthrs/model": patch
---

`ModelProxy.End` says whether the model produced any output (`produced`) and,
for a failed call, its `ModelError` code and the provider's HTTP status.
`ModelProxy.refusedCleanly(end)` reads a clean refusal from them: a call that
failed before any output, `rate_limited` or with a provider 4xx, which spent
nothing beyond the usage reported. A host that reserves spend settles such a
call to that usage, so a provider outage no longer spends a day's budget on
reservations. `producesOutput` and `failureOf` build the same `End` for a model
run in process.

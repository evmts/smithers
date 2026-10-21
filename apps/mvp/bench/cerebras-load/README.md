# Cerebras capacity benchmark

From the repository root:

```sh
zsh -lc 'source ~/.zshrc >/dev/null 2>&1; node apps/mvp/bench/cerebras-load/run.ts'
```

Uses the default endpoint's HostModel SDK route, with each attempt recorded as a SQLite flow action. No credentials are printed. Run after other model traffic is quiet. CHAT_MODEL may override the default but this benchmark's cost reservation applies only to the default Cerebras Qwen model: use the default for a valid capped run.

Evidence: `results/<UTC timestamp>/{raw.json,requests.jsonl,journal.sqlite,RESULTS.md}`. Latest report: `RESULTS.md`. `CEREBRAS_LOAD_SECONDS` can shorten steps for diagnostics (1–60 seconds); defaults to 60. Offline checks: `node --test apps/mvp/bench/cerebras-load/stats.test.ts`.

The final report documents admission reservations, stop rules, statistics, planning assumptions and limitations. Preserve failed starts and calibration receipts separately from the final ramp.

`CEREBRAS_LOAD_TOKEN_CAP` can lower (never raise) the 2M-token admission ceiling. The verified repeat used 1M to leave room for calibration and diagnostics within the overall requested budget. Reasoning is explicitly disabled for the final chat ramp because the SDK chat adapter does not decode Cerebras reasoning chunks; default-reasoning calibrations are retained separately.

The transport-fix repeat targets concurrency 10, 25 and 50 for 60 seconds per level, stopping escalation above 20% errors. It has a fresh 2M-token/$5 admission budget and uses `EgressHttpClient.providerFetch`, the shared Node HTTP/1.1 provider transport. See the timestamped receipts for levels actually reached.

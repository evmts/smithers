# L3 validation, 2026-10-02

Infrastructure work for smithersai/smithers#1846. This records executed evidence,
not a benchmark score. No benchmark model calls, Docker jobs, or local task VMs
were run. Only codex-1, codex-3, and codex-acct-1 were read for usage verification.

The CLI starts file flows through the existing repository `/invoke` route, and
retains numeric CI dispatch for its existing consumers. Cloud token minting uses
the existing backend token API; gateway token minting remains separate. Benchmark
and meter declarations, isolated credentials, per-trial Git/LFS export, usage
fitting, recovery checks, and operator instructions are included in this lane.

All builds and tests use `nice -n 10` and at most two test workers. Git/LFS
integration fixtures use small real repositories and archives, and delete their
temporary directories.

Executed CLI checks, from `packages/smithers`:

```sh
nice -n 10 pnpm exec vitest run test/BackendMutations.test.ts test/CloudFileFlowCli.integration.test.ts --maxWorkers=2 --coverage.enabled=false
# 92 passed; HTTP fixture exercises the actual source CLI in a separate process.
nice -n 10 pnpm exec vitest run test/TokenCommands.test.ts --maxWorkers=2 --coverage.enabled=false
# 34 passed; preserves gateway behavior and rejects altered Cloud scopes/expiry.
nice -n 10 pnpm exec vitest run test/OneCli.test.ts --maxWorkers=2 --coverage.enabled=false
# Final token-extension CLI check: 105/105 passed.
nice -n 10 pnpm exec tsc -p tsconfig.test.json --noEmit --incremental false
# exit 0
```

Executed sink and meter checks, from repository root:

```sh
nice -n 10 node --experimental-strip-types --test --test-concurrency=1 flows/test/benchmark-sink.test.ts
# 11/11 passed: real Git/LFS, archive retrieval, immutable exports, conflicts,
# failure retention, symlink/special-file rejection, secret redaction.
nice -n 10 node --experimental-strip-types --test --test-concurrency=1 flows/test/benchmark-meter-runtime.test.ts
# 9/9 passed: real HTTP/Git, run/duration completion, invalid usage, checkpoint
# recovery/refusal, cancellation, authentication failure, cleanup.
nice -n 10 node --experimental-strip-types --test --test-concurrency=1 --test-name-pattern='streamed redaction|cancellation interrupts' flows/test/benchmark-sink.test.ts
# Final sink changes: 2/2 passed, including Unicode escaped secrets and
# TERM→KILL of a resistant descendant. Other cases were not rerun here.
nice -n 10 node --experimental-strip-types --test --test-concurrency=1 --test-name-pattern='active run samples|HTTP 403|cancellation aborts' flows/test/benchmark-meter-runtime.test.ts
# After private Git configuration change: 3/3 passed; config600/home700,
# no inline header environment values, auth-home cleanup on all outcomes.
nice -n 10 node --experimental-strip-types --test --test-concurrency=2 flows/test/benchmark-runtime.test.ts flows/test/benchmark-flow.test.ts
# Final runtime and actual engine checks: 16/16 passed, zero skips/failures.
nice -n 10 node --experimental-strip-types --test --test-concurrency=2 --experimental-test-coverage flows/test/benchmark-meter.test.ts
# 19/19 passed; meter.ts executed line/function/branch coverage 100%.
nice -n 10 node --experimental-strip-types --test --test-concurrency=2 --test-name-pattern='finds the prompt bodies and conservatively projects the release delegates' flows/pack.test.mjs
# 1/1 passed; exact catalog inventory and warning assertions.
nice -n 10 node --experimental-strip-types --test --test-concurrency=2 flows/pack.test.mjs
# Final complete pack file after rebase/regeneration: 213/213 passed, 10 suites,
# zero failures or skips, including legacy real-CLI fixtures.
nice -n 10 node --test --test-concurrency=2 flows/test/benchmark-credentials.test.ts
# 10/10 passed: real Git LFS HTTP500 failure log contains no token; owner-only
# credential files; Python operator fixtures verify stdin-only secret writes,
# cooldown ordering, and no writes or leaked diagnostics on mint failure.
```

Final flow-package checks, from repository root:

```sh
nice -n 10 pnpm --dir flows exec tsc -p tsconfig.json --noEmit --pretty false
# exit 0; complete flow-package typecheck, including all new tests.
# From flows:
nice -n 10 pnpm exec eslint 'benchmark/*.ts' 'benchmark-meter/*.ts' --max-warnings=0
# exit 0; all new production flow files.
nice -n 10 pnpm exec dprint check benchmark benchmark-meter test/benchmark-credentials.test.ts test/benchmark-flow.test.ts test/benchmark-meter-runtime.test.ts test/benchmark-meter.test.ts test/benchmark-runtime.test.ts test/benchmark-sink.test.ts PACKAGE.ts pack.test.mjs
# exit 0; all changed flow sources, tests, declarations, and documentation.
```

Catalogs were regenerated after rebasing onto `main@origin` at `980f0d25`:

```sh
nice -n 10 pnpm exec smthrs target '//:factoryProjection' --write --jobs 1
# exit 0, one target ran, zero failures.
nice -n 10 pnpm run target-index
# exit 0; targetIndex and flows:testCoverage ran, zero failures.
```

No package `docs/` files changed, so documentation fleet sync/check gates do not
apply to the flow README or this validation receipt.

Only the pure meter has an executed 100% coverage receipt;
full production branch coverage is not claimed. CLI runs disable aggregate
coverage collection for targeted execution without changing repository thresholds.

Production commands used the source CLI as
`node /Users/williamcory/smithers-bench-l3/packages/smithers/bin/smithers.mjs`.
`SMITHERS_API_ORIGIN=https://api.jjhub.tech`; the supplied canary token was read
with `gcloud secrets versions access latest --secret multi-canary-plue-token`,
captured without printing it, and passed to child processes only through their
environment. No credentials are included in these receipts.

Both private repositories were created through the existing user-repository API:
`smithers-canary/bench` (97905) and `smithers-canary/bench-results` (97906).
A small source checkout was uploaded:

```text
smthrs repo push -R smithers-canary/bench --name benchmark-l3 --format json
exit 0
repository: smithers-canary/bench
ref: refs/smithers/users/1/benchmark-l3
commit: 64dffe947517b6097f0ed47557d9d2e501a3671d
updated: true
expires_at: 2026-11-01T23:09:24Z

git -c pack.threads=2 push https://api.jjhub.tech/smithers-canary/bench.git HEAD:refs/heads/main
exit 0: [new branch] HEAD -> main
```

That source snapshot predates the final local recovery and credential fixes. It
proves upload and admission only; it is not a receipt for execution of the final
implementation. No push was made to the Smithers repository's main branch.

The load gate was observed before invoking the flow: uptime reported 62.56 at
23:12:50 UTC and 45.57 at 23:14:50 UTC. The wait polled at two-minute intervals.

```text
smthrs flow start benchmark --cloud -R smithers-canary/bench --payload '{"suite":"noop","arms":["smithers"],"tasks":"all","k":1,"job":"noop-l3-20261002"}' --format json
exit 0, 2026-10-02T23:15:06Z
{"id":15995,"run_id":15995,"workflow_definition_id":68183,
 "flow":"benchmark","path":"flows/benchmark/flow.ts","status":"queued"}

smthrs runs show 15995 --cloud -R smithers-canary/bench --format json
exit 0: status queued, execution_plane flow, started_at null, completed_at null

smthrs runs logs 15995 --cloud -R smithers-canary/bench --format json
fresh temporary directory: no events returned within 240 seconds; client timed out

smthrs token mint --cloud --ttl 3h --scope write:repository --scope write:workspace --format json
exit 1: {"code":"forbidden","message":"insufficient token scope"}
```

The token endpoint also returned HTTP 403 directly. The supplied canary credential
lacks the `write:user` permission required to mint an expiring access token. No
expiry was fabricated, no nonexpiring credential was seeded as a benchmark
secret, and no model auth bundles were uploaded. The admitted flow did not start
while observed. Admission, secret seeding, host execution, and export remain
separate requirements.

The queued request was cancelled after observation, leaving no pending canary job:

```text
smthrs runs cancel 15995 --cloud -R smithers-canary/bench --format json
exit 0: {"data":null}
smthrs runs show 15995 --cloud -R smithers-canary/bench --format json
exit 0: status cancelled, started_at null,
completed_at 2026-10-02T23:31:33.168273Z
```

Fetching from another fresh directory exercised the public clone path:

```text
smthrs repo clone smithers-canary/bench-results --protocol https --directory fetched --format json
exit 0: {"cloned":"smithers-canary/bench-results","directory":"fetched",
         "protocol":"https","tool":"jj"}
git lfs install --local
exit 0: Updated Git hooks. Git LFS initialized.
git lfs pull --include 'jobs/noop-l3-20261002/*.tar.zst'
exit 2: Could not pull
git lfs logs last
Git can't resolve ref: "HEAD"
```

A direct authenticated Git clone independently confirmed the repository is empty.
No production noop tarball exists, so Cloud artifact retrieval was not proven.
The LFS diagnostic exposed an existing environment-header hazard: Git LFS writes
`GIT_CONFIG_VALUE_*` into its internal failure log. The final credential code uses
an owner-only temporary Git configuration file instead, and removes tracing and
inherited configuration variables. The diagnostic checkout was deleted.

Read-only production `wham/usage` requests succeeded for each permitted account:

| Account      | used_percent | reset_at (seconds) | limit_window_seconds |
| ------------ | -----------: | -----------------: | -------------------: |
| codex-1      |            2 |         1791580945 |               604800 |
| codex-3      |            3 |         1791580400 |               604800 |
| codex-acct-1 |            2 |         1791580508 |               604800 |

No real suite was launched. The current shared adapters lack the acknowledged
export/retention protocol; SWE-bench also lacks common per-instance Cloud drivers.
The runner refuses these paths before model work. The Harbor aggregate lacks the
original whole-job configuration/planned-count receipt and cannot pass strict
publication checks. Required L2 hooks are specified in README.md.

Remaining evidence: successful scoped credential seeding, a running production
invocation host, production completion/log projection, Cloud Git LFS export and
fetch, real task-image execution, and publishable paired reports. Meter estimates
assume exclusive benchmark-account use; proportional foreign usage is not
identifiable from aggregate whole-percent observations. A crashed sink publisher
can leave its checkout lock; remove it only after checking the recorded owner is
dead. No performance or benchmark-quality claim is made.

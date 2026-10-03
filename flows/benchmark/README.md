# Benchmark flows

`benchmark` runs a controller on the repository's managed host. Task environments
use the public Cloud workspace CLI. `benchmark-meter` samples Codex usage without
calling a model. A queued run receipt is admission, not proof of execution.

```sh
SMITHERS_API_ORIGIN=https://api.jjhub.tech
export SMITHERS_API_ORIGIN
smthrs flow start benchmark --cloud -R smithers-canary/bench --payload \
  '{"suite":"noop","arms":["smithers"],"tasks":"all","k":1,"job":"noop-20261002"}' --format json
smthrs runs show RUN_ID --cloud -R smithers-canary/bench --format json
smthrs runs logs RUN_ID --cloud -R smithers-canary/bench --format json
```

Run logs are fetched from the backend, so a fresh directory or another machine
needs the API origin and login, not the controller's `.flows` directory.

The payload requires `suite` (`tb4`, `deepswe`, `swebench`, `noop`), nonempty `arms`
(`smithers`, `codex`, `oracle`), `tasks` (names, `{"sample":10,"seed":42}`, or
`"all"`), and a unique `job`. Defaults: `k=1`, `model=openai/gpt-6.1-sol`,
`effort=max`, all three benchmark accounts, `concurrency=1`,
`resultsRepo=smithers-canary/bench-results`. Maximum concurrency is 32; it remains
subject to Cloud capacity. Sampling sorts the population and uses Mulberry32
with a backward Fisher-Yates shuffle. Every arm uses the same selected names.

Noop writes synthetic result and journal files, exports them through the real
Git/LFS sink, and writes `report.md` and `health.md`. It installs no model tools
and uses zero model calls. It proves storage, not benchmark quality.

Real controllers install Harbor **0.23.0**, `datacurve-pier` **0.3.1**, and Codex
CLI **0.155.1** on Cloud. Smithers 1.0 is built from the controller checkout;
the public npm registry does not yet publish its flow libraries or CLI version.
The job records the source revision and lockfile identity. The Mac downloads no
task images or benchmark datasets. Harbor and Pier receive
`SMITHERS_CODEX_POOL=codex-1,codex-3,codex-acct-1`; isolated account homes make
other local subscriptions unavailable. No `OPENAI_API_KEY` fallback is allowed.

## Credentials

The controller reads repository secrets at action dispatch. Payloads and journals
contain no credential values. Seed using a Cloud credential in `SMITHERS_TOKEN`:

```sh
python3 flows/benchmark/seed.py --repo smithers-canary/bench --ttl 3h
```

This invokes `smthrs token mint --cloud --scope write:repository --scope
write:workspace --ttl 3h`, then pipes the token and its expiry directly to
`smthrs secret set --body-stdin`. It emits only metadata. Seed only a dedicated,
private benchmark repository: file-flow `/invoke` excludes main-only secrets,
and repository secrets are available to its admitted flows. The default
gateway token from `smthrs token mint` authenticates gateway procedures; Cloud
REST, Git, and workspace operations require the `--cloud` token. Cloud permission
scopes are checked by the backend; this token is not confined to one repository.
Use a dedicated canary account containing only benchmark repositories.
The minting PAT must hold `write:user` and both requested scopes; repository-only
credentials receive HTTP 403. Third-party OAuth2 access tokens cannot manage
Smithers credentials, even with those scopes. These backend checks stay intact.

To reuse an already scoped Cloud token, export `BENCHMARK_SMITHERS_TOKEN` securely
and provide its actual expiry from the creation receipt or access-token metadata:

```sh
python3 flows/benchmark/seed.py --repo smithers-canary/bench \
  --existing-token --expires-at "$BENCHMARK_TOKEN_EXPIRES_AT"
```

Alternatively, use `--token-stdin --expires-at "$BENCHMARK_TOKEN_EXPIRES_AT"` with
the token supplied on stdin. Neither mode mints a token or accepts `--ttl`.
Missing, invalid, or elapsed deadlines fail before cooldown or secret writes.
`SMITHERS_TOKEN` still authenticates repository-secret writes. Repository and
ordinary workspace operations use `write:repository`; workspace children need
`write:workspace`. The helper does not establish permissions or discover expiry.
`GET /api/user/tokens` returns expiry metadata
under first-party authentication with `read:user`; a repository-only token cannot
read that list. Never describe an operator cutoff as a backend token expiry.

If the existing PAT has no backend expiry, provide an explicit benchmark cutoff:

```sh
python3 flows/benchmark/seed.py --repo smithers-canary/bench \
  --existing-token --cutoff "$BENCHMARK_CUTOFF"
```

The receipt reports `expiryKind: "operator-cutoff"`. The cutoff is stored as
`BENCHMARK_TOKEN_EXPIRES_AT` and bounds benchmark credential admission; it does
not expire or revoke the PAT. Remove the seeded repository secrets after the
run, and cancel any work still running at the cutoff. Preserve the original PAT
when other canaries use it. Record this distinction in evidence; only mint mode
or a known server expiry proves an expiring backend grant.

Before a model run, refresh these accounts **locally**, then seed their bundles:

```sh
RR_POOL=benchmark python3 flows/benchmark/seed.py --models --ttl 3h --cool-minutes 180
```

Only `codex-1`, `codex-3`, and `codex-acct-1` are read. The script runs `codex-rr
cool LABEL 180` for each before seeding `BENCHMARK_CODEX_AUTH_BUNDLES`. Cloud gets
owner-only temporary `auth.json` files; they are removed after each action.
A copied login has the same refresh token on both machines: a refresh on either
side can invalidate the other. Keep the local accounts cooled for the entire
Cloud run, refresh and reseed for the next run, and never copy the Cloud tokens
back into active local sessions. Cooldown is operational isolation, not a lock
against another independently launched process.

Secret names are `BENCHMARK_SMITHERS_TOKEN`, `BENCHMARK_TOKEN_EXPIRES_AT`, and
`BENCHMARK_CODEX_AUTH_BUNDLES`. `BENCHMARK_WORKSPACE_REPO` optionally selects the
task-workspace repository. The defaults use the canary repo. Secrets are never
in task guests, result summaries, or archives. Archive export rejects symbolic
links and credentials in binary files, excludes credential files, and redacts
known secret values from text. Failed export retains the trial and its journal.

## Meter

```sh
smthrs flow start benchmark-meter --cloud -R smithers-canary/bench --payload \
  '{"accounts":["codex-1","codex-3","codex-acct-1"],"job":"tb4-wave1","run":123}' --format json
# Or use durationSeconds instead of run (maximum 172800).
```

The meter samples `wham/usage` once a minute, including a final sample when a run
settles or the duration expires. Usage calls use the access token and account ID
from the seeded bundle; requests never refresh the login. `meter.json` joins
usage with finished trial summaries, recording account, model, start/end, and
uncached/cached/output tokens. Missing token records are listed, never treated as
zero. It fits an account/window cost model with least squares; singular designs
use weights **1, 0.1, 8** and fit their shared scale.

Whole-percent readings have a one-percentage-point interval uncertainty. Reset
gaps and counter regressions are flagged. Explicit foreign-session records and
unexplained usage quarantine contaminated intervals/windows. Proportional foreign
usage cannot be identified from aggregate percentages alone: the benchmark
accounts must carry no other work. Token timing is uniformly apportioned across
each trial's start/end interval. Median/p90 and error bounds describe the observed
suite/arm cases; these are not dollar prices or universal account constants.

## Fetch artifacts

```sh
smthrs repo clone smithers-canary/bench-results --protocol https --directory fetched
cd fetched
git lfs install --local
git lfs pull --include 'jobs/noop-20261002/TRIAL_ID.tar.zst'
tar --zstd -tf jobs/noop-20261002/TRIAL_ID.tar.zst
```

Authenticated fetches use the CLI login. On a fresh machine, install Git LFS and
authenticate Git/LFS against the same origin before running `git lfs pull`.
Do not put credentials in the Git remote URL. JSON summaries are normal Git
objects at `jobs/JOB/TRIAL_ID/summary.json`; archives are LFS objects at
`jobs/JOB/TRIAL_ID.tar.zst`. Reports and `meter.json` live at `jobs/JOB/`.

Pushes are serialized, conflict retries retain immutable exports, and the remote
push acknowledgment precedes `.exported.json`. Reusing a job with different input
or an existing trial with different evidence is refused. A crash can leave the
checkout publication lock; inspect its owner and remove it only after confirming
that publisher is dead. Never delete a retained guest or controller until all
exports have remote receipts.

## Shared adapter hooks still required

The checked-in adapters delete workspaces before this controller can acknowledge
an LFS export. Real suites therefore refuse before any model call unless their
module exposes `BENCHMARK_EXPORT_PROTOCOL = 1`. L2 owns these adapter changes;
this lane does not add a benchmark-only product API.

The required protocol is:

1. With `SMITHERS_BENCHMARK_RETAIN_UNTIL_EXPORT=1`, preserve every agent/verifier
   guest and export its journal into `SMITHERS_BENCHMARK_EXPORT_ROOT` before
   `stop()`. Persist workspace IDs with the trial; process exit is not an export.
2. Wait for `.exported.json` containing the acknowledged result commit. Only then
   use the existing public `workspace delete` path and clear ownership receipts.
   A failed or cancelled sink keeps the guest; recovery retries the same export.
3. Record the actual account, model, effort, completed timestamps, and input/cache/
   output token counts. Honor the explicit account pool and effort for both arms.
4. SWE-bench needs the same completed `result.json` and account record contract,
   plus Cloud Codex and oracle drivers. Its current Codex driver explicitly
   requires local Docker; no oracle driver exists. Until that seam is available,
   the whole SWE-bench suite is refused. The full-benchmark queue selects from the
   dataset, so passing a one-item warm-image sample would not select that case.

Harbor publication still uses `evals/harbor/report.py` and `health.py`, including
the report's pairing, containment, and 50-task publication checks. A failed
publication check retains evidence and produces an explicitly unpublishable
report. Noop bypasses scoring and labels all evidence synthetic.
The current per-attempt Harbor aggregation also lacks the original whole-job
configuration and planned-count receipt; its strict report remains unpublishable.
L2 must supply that receipt with the retention/export protocol before any score
can be published.

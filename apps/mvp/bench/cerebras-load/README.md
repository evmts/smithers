# Inference capacity qualification

This is the existing Cerebras harness, extended to price and test the reviewed
Cerebras, DeepInfra and Groq Qwen3.8-27B routes. No new provider SDK is used:
`HostModel` / `@smthrs/model` make calls inside the existing `@smthrs/flow`
probe, hosted by `TestNodeRuntime` and `EgressHttpClient.providerFetch` from
`@smthrs/platform-node` (catalog: `docs/libraries.md`).

Set credentials privately in the environment. For the custom DeepInfra and
Groq routes use `SMITHERS_MODEL_KEY_DEEPINFRA` / `SMITHERS_MODEL_KEY_GROQ`
and the corresponding `_ORIGIN` (`https://api.deepinfra.com` /
`https://api.groq.com`). Never print keys or put them in CLI arguments.

From the repository root, with `CHAT_MODEL` unset:

```sh
SMITHERS_LIVE_MODEL_TESTS=1 INFERENCE_PROVIDER=groq \
INFERENCE_LEDGER=/absolute/private/path/groq-campaign.json \
INFERENCE_CONTEXT=agent INFERENCE_CACHE=cold \
INFERENCE_CONCURRENCY=1,10,25,50 CEREBRAS_LOAD_SECONDS=60 \
node apps/mvp/bench/cerebras-load/run.ts
```

`INFERENCE_PROVIDER` defaults to `cerebras`; only `providers.ts` routes are
accepted. `INFERENCE_CONTEXT=agent` uses a synthetic roughly 9k-token prompt
(actual usage is retained); the default mixed corpus is 95% roughly 1.5k and
5% roughly 7k. Cold puts a nonce at the start; warm repeats the prefix, with
no promise the vendor actually cached it. Run cold and warm separately with
the **same** ledger. `INFERENCE_MAX_REQUESTS` caps admission at 1–10000
(default 10000), concurrency is 1–200, and steps last 1–60 seconds. Stop
escalating above 20% errors. Model requests explicitly disable the SDK
transport retry policy so one probe is one HTTP attempt; the flow records
the observation. No manual retry loop is added.

The campaign ledger limits each provider to $5 across all runs and phases;
load defaults to $2 (`INFERENCE_PHASE_CAP` selects a phase ceiling up to $5, still inside the campaign cap). Reserve UTF-8 prompt
bytes plus 4096 input tokens and 256 output tokens before sending. List prices
from 2026-10-21 are conservative: DeepInfra $.20/$2.50 and Groq $.80/$4 per
million input/output tokens. No cache/promo discount is assumed. Sources:
https://deepinfra.com/Qwen/Qwen3.8-27B and https://console.groq.com/docs/models.
Cerebras uses the prior receipt's $.99/$1.49, pending its capacity quote.

This experiment admission guard is intentionally separate from the SDK's
soft-forecast `Budget`: a soft forecast is insufficient for a capped paid
measurement. It is a CLI composition utility, not an app retry/runtime or a
production billing service. Each reservation is fsynced before dispatch;
known usage settles, clean single-attempt pre-output 4xx refuses at zero,
and unknown/interrupted spend retains its full reservation. A process-wide
exclusive lock prevents competing writers. On crash, verify the process is
dead before removing its `.lock` directory; **keep the ledger**. Corrupt or
unwritable accounting fails closed. This is a conservative estimate, not a
provider invoice guarantee. Provider-side spend limits remain useful.

The per-run token ceiling defaults to 2M for Cerebras and 20M for candidates;
`CEREBRAS_LOAD_TOKEN_CAP` can select a ceiling up to 20M, independently of
the persistent USD cap. A high-concurrency step can stop on reserved tokens
before actual spend; that is an admission limit, not provider saturation.

Evidence lives under `results/<UTC>/`: credential-free `raw.json`, append-only
`requests.jsonl`, a local SQLite flow journal, and `RESULTS.md`. Commit JSON
receipts and methods, not SQLite journals. A short smoke test is not a sustained
capacity result. Latency quantiles describe successful requests only.

For candidate agent evals, set `CHAT_MODEL` to the exact reviewed provider
record from `providers.ts`, retain the same credential environment and
`INFERENCE_LEDGER`, and run `pnpm eval` in `apps/mvp`. `INFERENCE_PROVIDER`
and `SMITHERS_LIVE_MODEL_TESTS=1` enable the $2 eval phase guard. It wraps the
actual model under ChatApi's durable steps. `EVAL_MAX_TOKENS` still provides
the suite's own limit; never update `EVAL_BASELINE` for a candidate. Candidate
costs use explicit provider rates and unknown usage remains reserved. Keep
the external judge fixed; record its separate subscription/API spend.

Offline checks:

```sh
node --test apps/mvp/bench/cerebras-load/*.test.ts
cd apps/mvp
pnpm exec vitest run evals --coverage.enabled=false
pnpm exec tsc -p evals/tsconfig.json --noEmit
```

The focused eval command does not claim full-app coverage. The repository's
normal coverage gate remains unchanged.

Workers use structured Effect concurrency: failure interrupts and joins siblings
before final evidence is written or the campaign lock is released. The CLI
cancels its own durable probe executions when their waiters are interrupted;
the provider observation context joins nested cleanup. Interrupted requests
retain their durable upper-bound reservation. Refused configuration creates no
result directory. Reports record the selected phase and its ceiling, and decode
throughput excludes successes without finite, ordered first-token timing.

Offline lifecycle integration checks use the real Node durable engine and
filesystem ledger; no paid provider request is made.

---
"@smthrs/flow": minor
"@smthrs/engine-store": minor
"@smthrs/flows": minor
"@smthrs/platform-browser": minor
"@smthrs/platform-cloudflare": minor
"@smthrs/agent": minor
---

Every flow run records usage metrics: which flows run, and how (`RunMetrics`).

- **`@smthrs/flow` `RunMetrics`.** The metrics and their log lines: `flows_runs_started` and `flows_runs_settled` by
  flow tag, outcome (`succeeded`, `failed`, `refused`, `cancelled`, `lost`) and failure code, door, actor kind and
  placement; `flows_run_duration_ms` and `flows_run_first_step_ms`; `flows_steps`, `flows_step_retries`,
  `flows_waits` and `flows_wait_ms`; `flows_model_calls` and `flows_model_tokens`. The log lines `flow.run.started`,
  `flow.run.settled` and `flow.model.call` carry the same fields, so a log store counts them too. `CurrentOrigin` and
  `withOrigin` name the door and actor kind of the runs started in a context; `settlement(exit)` classifies an exit by
  outcome and code. The lines are Debug unless a host provides `layerInfoLines` (`LineLevel`), as the browser engine and
  the Cloudflare host do, so a command-line program's standard output stays its own. Doors, actors, placements and wait kinds are closed sets (`other` otherwise); flow tags, model ids
  and codes are cleaned and capped per process (`maxFlows` 200, `maxModels` 50, `maxCodes` 100). No record carries a
  payload, a result, a failure's message or who started a run.
- **`@smthrs/engine-store`.** The durable engine records them for every run: admission, the lineage's settlement on
  every terminal path, the first activation, each step attempt that ran its body, and each durable wait from park to
  resume. A run keeps its origin and admission time in its state (`RunState.origin`, `RunState.parked`), so a later
  process measures it. `EngineStore.Options.placement` labels the store's runs (`local` by default). A run another run
  starts is door `flow` by its starter's actor kind.
- **`@smthrs/flows`.** `Runtime.Options.placement` passes the placement to the engine.
- **`@smthrs/platform-browser`.** The engine worker's runs are placed `browser`, and `BrowserEngine.start` carries the
  caller's origin to the leader, which admits the run under it.
- **`@smthrs/platform-cloudflare`.** `CloudflareRuntime` places its runs `cloudflare`. `ExecutionObject.Intent` gains an
  optional `origin`, which `intent` reads from the caller's context and the alarm admits the run under; it is not part
  of the intent's identity.
- **`@smthrs/agent`.** A model step counts each provider call and the tokens it reported under its flow, and an agent's
  tool call starts its runs through door `agent`, actor `agent`.

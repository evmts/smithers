---
title: "Installation"
description: "Add @smthrs/evals to a workspace package, plus its runtime requirements and entry points."
---

Prereleases are published to npm under the `next` tag. Install the package
with its `effect` peer dependency:

```bash
pnpm add @smthrs/evals@next effect@^4.0.4
```

To work against the source instead, use it from a package in a clone of
https://github.com/smithersai/smithers and depend on it through the workspace
protocol:

```json
{
  "dependencies": {
    "@smthrs/evals": "workspace:*"
  }
}
```

## Runtime requirements

- Node.js 26.4.0 or later, from the package's `engines` field.
- `effect` `^4.0.4`. Suites, runs, baselines, and gates are all `Effect`
  values, so every program composes with the `effect` library directly.
- `@smthrs/core` supplies `Flow` values. `@smthrs/scorers` supplies scorers,
  bindings, and the pure `@smthrs/scorers/ScoreGate` grading contract, including
  `ScoreGateError`. The evaluation runtime does not load `@smthrs/testing`;
  that package supplies a test facade for development consumers. To run the
  agent behind a case, add [@smthrs/agent](/api/agent) as well.

## Entry points

- `@smthrs/evals` exports the nine namespaces: `EvalError`, `Suite`,
  `CaseExecutor`, `Runner`, `Baseline`, `Regression`, `Report`, `Gate`, and
  `Trials`.
- `@smthrs/evals/<Module>` imports one namespace directly, for example
  `@smthrs/evals/Suite`.
- `@smthrs/evals/package.json` is exported. The `internal/*` modules and
  nested `*/index` subpaths are not public.

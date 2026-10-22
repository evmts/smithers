---
"@smthrs/sandbox": minor
---

`CiJob`: one CI job on one machine. `ci/job` checks out exactly the commit,
runs each step in order as its own durable action and settles an outcome,
`passed`, `failed`, `cancelled` or `skipped`, never a failure, so `Node.all`
over several jobs reports every row. The host provides the machine through
`CiJob.Machine`.

```ts
import { CiJob } from "@smthrs/sandbox"

const lint = CiJob.make("lint", { steps: [{ name: "lint", run: "pnpm lint" }] })
// in a flow's body: lint.call({ run, repo, sha, ref })
```

`@smthrs/plan` is now a dependency of `@smthrs/sandbox`, not only a
development one.

# CI on Smithers

A repository's checks run on Smithers' machines, as durable flows, never on GitHub Actions (ruling FLOW-8; [the CI/CD parity proposal](../proposals/ci-cd-parity.md)). This page covers the spine: a CI job on its own machine, and a repository's own flow, planned in a QuickJS realm, whose jobs those are.

```
FlowExecution DO                                   SandboxObject DO + container (kind "job")
 ci/job { target, job } ─ ci/job/Checkout ──────────▶ wake: git fetch --depth 1 origin <sha>; detached checkout
                        ─ ci/job/Step × n ──────────▶ sh -c <step> as the `ci` user, once per (run, job, step)
                        ─ ci/job/Release ───────────▶ sleep now
 settles { outcome, steps }                          egress: registry.npmjs.org, plugins.dprint.dev; nothing else
```

## Jobs

`ci/job` is `@smthrs/sandbox`'s `CiJob` ([its API](../../../../packages/smithers/flows/sandbox/docs/api.md#cijob)): a child flow that reserves one machine for one job, checks out exactly the commit, runs each step in order and settles an outcome value, never a failure.

| Outcome | When |
|---|---|
| `passed` | the checkout is exactly `target.sha` and every step exited 0 within its time |
| `failed` | the machine has another commit; a step exited non-zero, ran past its time (600 s at most) or was lost; or the machine never answered within 30 minutes of retries, which the result shows as one `machine` step |
| `skipped` | a step after the one that failed: never run |
| `cancelled` | the run was stopped |

- **One machine per job.** `worker/flows/CiJobMachine.ts` names it `job-<digest of job:<run>:<job>>`: a branch machine of `kind: "job"` (`worker/BranchSandboxes.ts`) from the branch sandbox's image, which pins Node 26.5.0, pnpm 11.25.0 and git (`infra/sandbox/Dockerfile`). Two jobs of a run, and the same job of two runs, never share one. There is no separate job container class: the image and the object are the branch sandbox's.
- **Exactly the commit.** The machine's wake fetches the one commit by its id from GitHub and checks it out detached (`worker/branch/Checkout.ts`), finishing a checkout a stopped machine left half done, so a pull request's head from a fork, which is no branch of the repository, checks out the same way. `ci/job/Checkout` reads `HEAD` back and runs no step unless it is `target.sha`.
- **Commands only in the box.** A step is a `sh -c` command run by the sandbox tools' `run` (`@smthrs/sandbox`'s `SandboxTools`), as the box's `ci` user, never a person's. The Worker runs none.
- **Registry only.** A job's box reaches `registry.npmjs.org` and `plugins.dprint.dev` and nothing else, and holds no secret ([where checks run](pulls.md#where-checks-run), `worker/branch/JobEgress.ts`).
- **At most once.** Each step is its own durable action; its tool call id is the version 5 UUID of `<run>:<job>:step:<index>`, so a step the machine started and lost settles `failed` with exit code `-1` and never runs twice.
- **Released when done.** `ci/job/Release` stops whatever the job's steps left running (a server or a watcher started in the background) and puts the machine to sleep at once rather than waiting for its keep-alive. A job whose machine never answered is released too.

A CI job starts only from a repository's flow; no route starts one by name ([no remote door](remote-flows.md#no-remote-door)).

## Repository flows

A repository declares its CI as TypeScript: `.smithers/flows/<flow>/flow.ts`, one `Flow.make` whose body returns the flow's jobs. It type-checks against the real SDK; the realm reads only its tag and its body (e2e/fixtures/ci-repo is one).

```ts
// .smithers/flows/ci/flow.ts
import { Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { CiJob } from "@smthrs/sandbox"
import { Schema } from "effect"

const versions = CiJob.make("versions", { steps: [{ name: "node", run: "node --version" }] })
const lint = CiJob.make("lint", { steps: [{ name: "install", run: "pnpm install --frozen-lockfile" }, { name: "lint", run: "pnpm lint" }] })

export default Flow.make("ci", {
  payload: { run: Schema.String, repo: Schema.String, sha: Schema.String, ref: Schema.String, event: Schema.String },
  success: Schema.Struct({ versions: CiJob.Result, lint: CiJob.Result }),
  body: (run) => Node.all({ versions: versions.call(run), lint: lint.call(run) }),
})
```

```
FlowExecution DO
 repo/Run { run, repo, flow, sha, ref, event, secrets }
   repo/Plan ── GET contents/.smithers/flows/<flow>/flow.ts?ref=<sha> (App, Contents: read)
             └─ QuickJS realm: sucrase strips types; Flow.make, Node.all, CiJob.make as data ─▶ { jobs }
   repo/Jobs (child) ─ repo/Pending ─▶ smithers/<flow> pending
                     ─ ci/job × n, at once (one machine each)
                     ─ repo/Report ─▶ smithers/<flow> success | failure (App, Commit statuses)
```

- **The realm plans; the machines run.** `worker/ci/Realm.ts` evaluates `flow.ts` in a fresh QuickJS runtime with 8 MiB of memory, a 128 KiB stack and a step budget, against four modules: `@smthrs/flow` (`Flow.make`), `@smthrs/plan` (`Node.all`), `@smthrs/sandbox` (`CiJob.make(name, { steps }).call()`) and `effect` (`Schema`, inert). The body is called once with `{ run, repo, sha, ref, event }`. Any other import, a relative one included, is refused, and the plan is checked as `CiJob.Job`s outside the realm. The Worker and the engine never evaluate the repository's code, and no command runs anywhere but a job's machine.
- **Exactly the commit.** `repo/Plan` reads `flow.ts` at the run's commit, and each job checks out that commit; nothing the flow returns can change the commit, the repository or the machine.
- **One status per flow.** `repo/Jobs` reports `smithers/<flow>` pending as its jobs start (best effort), then success when every job passed, else failure naming the failed jobs (`Failed: lint`). A flow that can't be planned runs no job and reports failure with the reason: `Couldn't run the flow (not_found)`, `(import)`, `(syntax)`, `(limit)`, `(invalid_plan)`, `(tag)`, `(too_large)`, `(evaluation)` or `(unreadable)`.
- **The flow's tag is its directory.** `.smithers/flows/ci/flow.ts` must declare `Flow.make("ci", …)`.
- **Retries.** GitHub's or Postgres' outages are retried, 1 s doubling to a minute, for 30 minutes (the report: until GitHub takes it). A refusal (no Contents or Commit statuses permission, the App not installed) is recorded once and never retried; the jobs still run.

Not yet: a repository flow imports nothing but the four modules (no shared `../_ci/target.ts`); `Node.all` is the only combinator, so jobs can't depend on one another; a person can't start a repository flow by hand (`ci-parity-manual-run`); runs show on no page yet (`ci-parity-run-view`).

## Observability

| Name | Kind | Fields |
|---|---|---|
| `ci.job.call` | log | `run`, `repo`, `job`, `call` (`checkout`, `step`, `release`), `outcome` |
| `smithers_ci_job_calls{call,outcome}` | counter | `checkout`: `exact`, `refused`; `step`: `passed`, `failed`; `release`: `slept`, `busy`, `gone` |
| `ci.repo_flow.plan` | log, span | `run`, `repo`, `flow`, `sha`, `outcome` (`planned` or the refusal), `jobs` |
| `ci.repo_flow.status` | log | `run`, `repo`, `flow`, `sha`, `state`, `outcome` (`sent`, `refused`, `dropped`), `errorCode` |
| `ci.realm.plan`, `ci.repo_flow.report` | span | `smithers.ci.flow` |
| `smithers_repo_flow_plans{outcome}`, `smithers_repo_flow_statuses{state,outcome}` | counter | |

No record carries a flow's source, a command, its output or a secret.

## Tests

| Test | Proves |
|---|---|
| `packages/smithers/flows/sandbox/test/CiJob.test.ts` | the flow on the memory engine: order, skip after a failure, a timeout, another commit, the schemas' refusals, and two jobs as two child runs where one fails and its sibling passes |
| `worker/flows/CiJobMachine.test.ts` | the app's machine on the Node host: one machine per run and job, the `ci` user, one call id per call, a lost step, a machine that couldn't start |
| `worker/flows/CiJob.docker.test.ts` | real containers of the branch sandbox's image, commands as a user of their own: two jobs at once, each at exactly a commit of `roninjin10/smithers-github-tests` fetched from GitHub, Node v26.5.0 and pnpm 11.25.0, `exit 1` failing while its sibling passes, and a background process a step left stopped by the release |
| `worker/branch/Checkout.test.ts` | the checkout of one commit by its id, detached and shallow, and a commit the forge lacks |
| `worker/ci/Realm.test.ts` | the realm in Node's QuickJS: a TypeScript flow's jobs; a body deciding from its payload; refused imports, used or not, static or aliased; a loop, a memory bomb and a runaway recursion stopped; syntax, throws, a forged `JSON.stringify`, bad or repeated jobs, a wrong tag |
| `worker/ci/Realm.workerd.test.ts` | the realm in local workerd, bundled as Alchemy bundles ChatApi: a flow planned, and a loop stopped by the step budget, since workerd holds its clock still while code runs |
| `worker/ci/RepoFlow.test.ts` | `repo/Run` on the Node host against the scripted GitHub: flow.ts read at the commit, two jobs on two machines, `smithers/ci` pending then success or `Failed: lint`, no flow or a refused one running nothing, missing permissions, and GitHub's and Postgres' outages retried |

# CI on Smithers

A repository's checks run on Smithers' machines, as durable flows, never on GitHub Actions (ruling FLOW-8; [the CI/CD parity proposal](../proposals/ci-cd-parity.md)). This page covers the spine's first slice: a CI job on its own machine.

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

## Observability

| Name | Kind | Fields |
|---|---|---|
| `ci.job.call` | log | `run`, `repo`, `job`, `call` (`checkout`, `step`, `release`), `outcome` |
| `smithers_ci_job_calls{call,outcome}` | counter | `checkout`: `exact`, `refused`; `step`: `passed`, `failed`; `release`: `slept`, `busy`, `gone` |

No record carries a command, its output or a secret.

## Tests

| Test | Proves |
|---|---|
| `packages/smithers/flows/sandbox/test/CiJob.test.ts` | the flow on the memory engine: order, skip after a failure, a timeout, another commit, the schemas' refusals, and two jobs as two child runs where one fails and its sibling passes |
| `worker/flows/CiJobMachine.test.ts` | the app's machine on the Node host: one machine per run and job, the `ci` user, one call id per call, a lost step, a machine that couldn't start |
| `worker/flows/CiJob.docker.test.ts` | real containers of the branch sandbox's image, commands as a user of their own: two jobs at once, each at exactly a commit of `roninjin10/smithers-github-tests` fetched from GitHub, Node v26.5.0 and pnpm 11.25.0, `exit 1` failing while its sibling passes, and a background process a step left stopped by the release |
| `worker/branch/Checkout.test.ts` | the checkout of one commit by its id, detached and shallow, and a commit the forge lacks |

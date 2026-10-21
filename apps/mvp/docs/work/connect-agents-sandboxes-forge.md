---
title: Connect the agent, sandboxes and the forge (feature 7)
status: in-progress
area: infra
owner: sandbox tools builder
updated: 2026-10-20
links: [../decisions/0005-sandboxes-secrets-and-the-forge.md, ../decisions/0006-repo-clone-and-view.md, ../decisions/0008-auth.md, design-questions.md, ../decisions/0011-the-agent-runs-in-the-browser.md, sandboxes.md, flows-and-agent.md, durable-browser-engine.md, model-endpoint.md, branch-terminal.md, secrets-proxy.md, todos-and-stack.md, dev-stack-hygiene.md]
---

## Current specification — 2026-10-20, 17:44 PDT

**What:** Connect the browser agent to durable branch-machine tools.

**Why:** People and agents need the same branch tools without secret exposure or person-only authority.

**Current state:** Six durable tools and closed-tab behavior were reported passing. Will approved sandbox-tools at 17:41:43 PDT. Secret egress stays disabled pending the opacity browser proof; per-run authority remains separate unfinished work.

**Next step:** Retain approved tool regressions and finish secret-egress and credential gates before enabling their broader capabilities.

**Open questions for Will:** None for this update.

Evidence: queue answers through 2026-10-21 00:42:06 UTC and script-filtered human text/lead replies from 22:43–00:43 UTC; current rulings and decision 0017 supersede historical briefs. Product checks are reported evidence; this tracker validates the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 16:35 PDT

**What:** Connect the browser agent to branch-machine tools as durable flow steps and finish forge integration.

**Why:** The agent must execute recoverably without holding secrets.

**Current state:** At 16:25 the lead reported six real tools: command execution, file read/write/list, status and diff. A real-model browser test wrote a file, ran a check and showed its diff; closing the tab mid-command recorded the call once. Readers are refused, locked branches return 409, and agent push/approve/merge are unavailable. Broader forge completion has no new receipt.

**Next step:** Retain tool and closed-tab recordings; finish remaining forge work and the disabled egress proof.

**Open questions for Will:** None. The lead chose to report a command result lost after machine restart and let the agent decide whether to rerun; this is a lead choice, not a new ruling.

Evidence: lead text replies extracted by script from the session’s latest two hours through 23:34:16 UTC; current rulings and queue answers take precedence over older designs. Reported product-test receipts only; this tracker ran no product tests.

## Prior tracker record (retained)


## Current specification — 2026-10-20, 15:54 PDT

**What:** Connect agent tools to branch machines as durable steps.

**Why:** The browser agent needs recoverable code execution without receiving secrets.

**Current state:** At 15:17 PDT the lead reported dev-stack recovery and queued recordings of agent tools and a tool call surviving tab closure. This establishes progress on tools and recovery; no completed push-to-forge or full feature receipt was reported.

**Next step:** Retain tool/recovery recordings and finish forge integration and the switched-off secrets egress proof.

**Open questions for Will:** None; prior host-loop independence answer remains in force.

Evidence: lead text replies extracted from the latest two hours of session 6253ecf2; current rulings and queue answers take precedence over older briefs. No product tests rerun by this tracker.

## Prior tracker record (retained)


## What

The Smithers agent and UI work with branches and sandboxes on our forge. The coding agent's loop runs on our host and its tools act in the branch's sandbox, so every model call stays a durable `ModelStep` and model keys stay out of the box. Every write to Code Storage is a flow step, fenced by the expected target commit. For now every sandbox agent uses the fast Qwen model.

Since 22:42 on 2026-10-19 (0005 Q2, answered by Will): a sandbox is a tool provider. It exposes only the machine and its tools (exec, files, jobs, previews) as durable flow steps and knows nothing about agents. The agent loop runs on its own host, the browser under [0011](../decisions/0011-the-agent-runs-in-the-browser.md), and binds a branch's sandbox tools like any other tools, so either side can change without the other. Until 22:31 "our host" above meant Cloudflare. Third-party CLI agents (Claude Code, Codex) run inside the box later as `job/Run` jobs, because they bring their own loop.

## Why

Will: "Our almost final feature is connecting all these things." "For now we can make it simple by making it so our fast quen model is the only model sandboxes uses but not later I will make the coding agents use smarter agents".

Will, 22:42: "This is a great question! So we want the sandbox to only expose the sandbox and it's tool and the agent to be independent of that. We want as modular/durable an architecture as possible."

## State

- Designed in decision 0005 (proposed). Nothing is built.
- It is the work step of [TODOs and the stack](todos-and-stack.md)'s second slice.
- 21:21 on 2026-10-19: the lead asked Will to accept the recommended answers below in one batch ([design questions](design-questions.md)). No answer yet.

- 22:31: decision [0011](../decisions/0011-the-agent-runs-in-the-browser.md) moved the agent loop into the browser; sandboxes stay remote because they need a machine.
- 22:41: asked alone as question 7 of 14: the agent's loop stays in the browser and only tools that need a computer (bash, tests, builds, file edits) run in the branch's sandbox, so every model call stays a durable step through the [model endpoint](model-endpoint.md) and the model key never enters the box.
- 22:42: **answered yes** (quote under Why). Recorded in 0005 under Q2. 0005 stays proposed until its budget question (Q3, asked 22:43) is answered ([sandboxes](sandboxes.md)). Nothing is built.
- 22:45: 0005 Q3 deferred until we ship ([sandbox budgets](sandbox-budgets.md)). **All three of 0005's questions are settled**, so this item moves from designing to todo. 0005's status line in the file still reads "proposed". Nothing is built.
- 23:02 on 2026-10-19: the lead's board: features 5 to 7 (sandboxes, secrets, and Qwen in sandboxes) are not started; they "wait for disk space and the agent". The Mac had about 10 GB free at 23:01, and the agent's first slice depends on B1 and the [model endpoint](model-endpoint.md).
- 13:19:52 on 2026-10-20: the lead's list: "Branch sandboxes, secrets via an egress proxy, agent connected to sandboxes and the forge: not started".
- 13:21:12: the lead: "Branch sharing, branch sandboxes, and connecting the agent to sandboxes: these build on the branch and terminal slice that's still running." So they wait for the [branch terminal](branch-terminal.md) builder. Of the group, only [secrets through an egress proxy](secrets-proxy.md) started (13:22:52), at a seam outside the container and terminal code.
- **13:43:30 on 2026-10-20, the lead started the builder:** "the agent runs commands, edits files and reads the diff on the branch's machine, as durable steps; the sandbox stays awake while something runs". It builds on the branch slice's `SandboxObject`, container and `GitProxy` (R4-10 fixed, 13:42:00). **Status moved from todo to in-progress.**
- 14:30 on 2026-10-20, on disk, the builder: six typed tools (`sandbox/run`, `read`, `write`, `list`, `status`, `diff`), client flows the agent, slash commands and `POST /api/sandbox/calls` run alike, each starting the remote `sandbox/Call` that runs it on the branch's machine as the person who asked (edit access on the branch, never a locked one), at most once per call ([sandbox tools](../features/sandbox-tools.md)). SDK: `SandboxTools` in `@smthrs/sandbox`, `ContainerSession` in `@smthrs/platform-cloudflare`. Migration `0024_sandbox_calls`. The e2e (`e2e/sandbox-tools.spec.ts`) waits for the dev stack's restart and migrations.
- 14:15 to 14:17 on 2026-10-20: the session usage limit stopped the builder with 12 others; the lead resumed all 13 at 14:19.
- **14:25:29 on 2026-10-20, the builder to the lead:** its e2e needs the shared dev stack migrated (the dev database was at 0017; `0024_sandbox_calls` is its own) and restarted; the dev Worker failed every branch request with "DurableObject 'RoomObject' not found" until [branch sharing](branch-sharing.md)'s new object got an `alchemy dev` restart. It adds no Durable Object class or binding, only methods on `SandboxObject` and two remote flows on `FlowExecution`.
- **14:26: migrated (0018 to 0024) and restarted** ([dev stack hygiene](dev-stack-hygiene.md)); the lead tells it to run `e2e/sandbox-tools.spec.ts`.
- 14:30, the lead: the builder also wires the [secrets egress](secrets-proxy.md) seam in `SandboxObject`.
- 16:24 on 2026-10-20, the builder: `e2e/sandbox-tools.spec.ts` passes against `alchemy dev` with a real container (2 passed, 3.0 min): the real model's agent writes a file, runs `grep … && echo tests-passed-…` and shows the diff; a scripted agent's 15-second command whose tab closed mid-run is recorded once and the reopened tab reads it. GIFs: `~/Desktop/smithers-mvp/gifs/sandbox-tools-agent-tools.gif`, `sandbox-tools-closed-tab.gif`. The secrets egress is wired into `SandboxObject` behind `SANDBOX_SECRETS`, off by default.

## Next

From 14:30 on 2026-10-20: `e2e/sandbox-tools.spec.ts` on the restarted stack, with GIFs: the agent runs a command, edits a file and reads the diff on a branch's machine, each a durable step; then the egress seam for [secrets](secrets-proxy.md). Pushing to Code Storage and [TODOs](todos-and-stack.md) slice 3 follow.

Until 14:30 on 2026-10-20 the next step was, from 13:43 on 2026-10-20: the builder's report, with e2e and GIFs: the agent runs a command, edits a file and reads the diff on a branch's machine, each a durable step, and the sandbox stays awake while one runs. Pushing to Code Storage and [TODOs](todos-and-stack.md) slice 3 follow.

Until 13:46 on 2026-10-20 the next step was, from 13:21 on 2026-10-20: after the [branch terminal](branch-terminal.md) slice and [sandboxes](sandboxes.md): the agent edits a file on a branch sandbox, runs the tests, and pushes to Code Storage. [TODOs and the stack](todos-and-stack.md) (Panel T, designing since 13:23) names this as what its later slices wait on.

Until 13:21 on 2026-10-20 the next step was: after the sandbox spike and the agent's first slice: the agent edits a file on a branch sandbox, runs the tests, and pushes to Code Storage.

## Questions for Will

- May "agents run in sandboxes" mean the loop runs on the host with its tools inside? CLI agents would run inside as jobs later. Recommended: yes. (Answered 22:42: yes; "we want the sandbox to only expose the sandbox and it's tool and the agent to be independent of that".)
- None open here; the sandbox budgets question is on [sandboxes](sandboxes.md).

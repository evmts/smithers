---
title: Connect the agent, sandboxes and the forge (feature 7)
status: todo
area: infra
owner: Panel S (Opus lead, Sol)
updated: 2026-10-19
links: [../decisions/0005-sandboxes-secrets-and-the-forge.md, ../decisions/0006-repo-clone-and-view.md, ../decisions/0008-auth.md, design-questions.md, ../decisions/0011-the-agent-runs-in-the-browser.md, sandboxes.md, flows-and-agent.md, durable-browser-engine.md, model-endpoint.md]
---

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

## Next

After the sandbox spike and the agent's first slice: the agent edits a file on a branch sandbox, runs the tests, and pushes to Code Storage.

## Questions for Will

- May "agents run in sandboxes" mean the loop runs on the host with its tools inside? CLI agents would run inside as jobs later. Recommended: yes. (Answered 22:42: yes; "we want the sandbox to only expose the sandbox and it's tool and the agent to be independent of that".)
- None open here; the sandbox budgets question is on [sandboxes](sandboxes.md).

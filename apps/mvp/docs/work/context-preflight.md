---
title: Context preflight and the Context line on answers
status: idea
area: app
owner: unassigned
updated: 2026-10-20
links: [old-app-feature-gaps.md, cerebras-rate-limits.md, flows-and-agent.md, agent-repo-navigation.md, notifications-and-live-work.md, ../features/agent.md]
---

## What

Before answering, the agent chooses what to put in its context, and the answer shows what it read.

Old app:
- A "Context · N" toggle under an answer expands to file, wiki page, issue, TODO and run chips, each opened at its pinned revision, plus **Inspect** (`apps/app/src/mainview/ContextLine.tsx`, `ContextContainer.tsx`, `flows/contextActions.ts`).
- Wiki notes enter the model's context within an 8,000-character budget, the open note first (`state/WorldContext.ts`).
- `repo.update` adds the repository's recent activity to the context without showing a card (`state/controller/repositoryUpdate.ts`).

Spec mvp.md §6.5, Context preflight (Will): "A conversation isn't the agent's context window." Preflight picks files, wiki pages, TODOs and runs; Inspect shows it as the run's first step.

New app: the agent sends the conversation's history. [Cerebras rate limits](cerebras-rate-limits.md) proposes capping it by tokens, and [feature 4](agent-repo-navigation.md) adds file reads. Nothing chooses context or shows it.

## Why

- It keeps a long conversation usable and cheap on the Cerebras token limits.
- A person sees what an answer was based on and can open it.

## How it fits

- A first step in the agent's flow, `chat/Preflight`. It starts deterministic: the open view, mentioned paths, the latest subjects. A fast-model pick through `ModelStep` comes later.
- The answer row stores references (ids and revisions), never content, so telemetry rules hold.
- An `@smthrs/ui` chip list under the answer. Inspect opens the run once runs land ([notifications and live work](notifications-and-live-work.md)).

## Size

M.

## Questions for Will

None.

---
title: Restore branch creation after cloning
status: done
area: branches
owner: Codex prod-new-branch-config
updated: 2026-10-24
links: [../features/branch-creation.md, ./prod-new-branch-config.md]
---

Will selected option C: new conversations create ephemeral Code Storage refs;
GitHub writes stay explicit. Decision [0095](../decisions/0095-new-conversation-ephemeral-refs.md)
supersedes the GitHub interpretation of 0012/0013 for new conversations.

Repository-selected public `Flow.make` source is pinned at one commit and runs
through the plugin manifest and bounded SDK `RealmFlow` interpreter. The default
plugin creates an ephemeral ref; a repository override may select the durable
GitHub action. Migration 0055 persists namespace, forge and GitHub admissions.
Reads, sharing, presence and sandboxes retain that identity. Ephemeral checkouts
use full history through the branch-scoped SDK proxy; ordinary checkouts retain
depth 50, and CI commit checkouts remain detached.

Catalog entries: `@smthrs/effect-code-storage`, `@smthrs/flow`, `@smthrs/plan`,
`@smthrs/plugin`, `@smthrs/harness` and `@smthrs/integrations`.
The SDK changes landed separately. This rework adds no public SDK API.

The original 9823226b was bounced by the config-at-build gate. The rework captures
deployment choices before requests and durable steps, as decision 0088 requires.
Current validation and review evidence lives in [the rework note](prod-new-branch-config.md).
No production e2e, push or deploy is part of this change.

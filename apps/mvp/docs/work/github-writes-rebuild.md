---
title: Rebuild GitHub writes hardening on current main
status: in-progress
area: github
owner: codex-github-writes-rebuild
updated: 2026-10-22
links: []
---

Reapply the curator and five builder commits onto 998199dc6263, preserving current
sign-in, device authority, plugins, TODO admission/Drop and shape recovery.
Use the catalog GitHub entry, `@smthrs/integrations`, and durable `@smthrs/flow` steps.
Keep the session role scoped to the repository where it was read.
No push. All installs and validation run serially through Latitude.
Migrations 0043/0044 are reserved; this stack uses 0048–0050 (0045–0047 went to base-closed-early, custom domains and conversations).
Projection ordering decision is 0077 (renumbered at landing; main has decisions up to 0076).

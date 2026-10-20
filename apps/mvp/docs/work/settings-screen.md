---
title: Settings screen for admins and for each person
status: idea
area: app
owner: unassigned
updated: 2026-10-20
links: [old-app-feature-gaps.md, model-endpoint.md, sandbox-budgets.md, repo-follow-ups.md, roles-and-labels.md, secrets-proxy.md, keyboard-navigation-and-vim.md, ../decisions/0007-roles-and-tags.md]
---

## What

One place to change settings, by role.

Old app:
- `/settings` (`apps/app/src/mainview/flows/entries/settings.ts`, `cards/SettingsContainer.tsx`, `cards/views/SettingsView.tsx`): address and health, the GitHub App, machines (TODOs at once, TODOs per day, new TODOs start pre-approved), notifications (needs HTTPS), the Obsidian folder, and model roles (Coding, Fast, Decisions keys, through `cards/ModelCards.tsx`).
- The repository's Settings tab (`repository/RepositorySettings.tsx`): the models in use and GitHub sync status, for members only.
- Make a repository read-only, or disconnect it after a confirmation (`state/controller/connectors.ts`).
- Personal: theme, input mode and notification permission.

New app:
- The theme button.
- `admin/SetModel` exists with no screen; [model endpoint](model-endpoint.md) says "from the CLI or an admin view".
- Sandbox limits are planned as admin settings changed without a deploy ([sandbox budgets](sandbox-budgets.md)).
- The import pause `repo/SetImports` is CLI-only ([repo follow-ups](repo-follow-ups.md)).

## Why

- Every admin setting the plan creates (models, budgets, the import pause) needs a door a person can press.
- Will on models (0004.2): "make it super easy to configure by us as admins".

## How it fits

- One view at `/app/settings`, sections by role:
  - Personal: theme, input mode, notifications.
  - Admin: model roles through `admin/SetModel`, budgets, the import pause.
  - Repository: Members, Secrets and Labels as decisions 0007 and 0005 build them, and GitHub sync status.
- Each control dispatches the existing flow, so the agent can do the same, except where a flow is person-only.
- Values sync read-only from Postgres. Forms use `@smthrs/ui`'s `flow-form` helpers.

## Size

M.

## Questions for Will

- One Settings screen with sections by role, or a separate admin screen? Recommended: one screen.

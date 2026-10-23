---
title: Production multi-repository issue verification and settled lists
status: done
area: app
owner: Codex GPT-6.1 Sol
updated: 2026-10-23
links: [../decisions/0079-roles-per-repository.md, ../features/issues.md]
---

Production evidence on 9696f4c4 confirms the write reached GitHub. Fix the unauthenticated verification and the perpetual issues spinner. Under ARCH-5 and decision 0079 Slice 1, an unsynced list renders device rows without a spinner or false empty counts, using the library catalog's existing `@smthrs/ui` `IssuesView.unknown` contract. Issue shapes remain scoped to the deployment repository.

The original list regression failed with `loading: true`; it now passes with unknown counts. GitHub reads share dogfood's token-aware helper. A polling boundary carries HTTP errors out immediately, since `expect.poll` otherwise swallows them. Real local HTTP tests cover token set/empty/unset, 403/429/500 failing after one request, and eventual successful reads. A real UI render covers empty and Requested-only lists, with no busy state, false counts or "No issues".

Validation: importRules and full app typecheck passed; 44 distinct touched unit/integration/rendering tests passed (43 in the issues/view/HTTP run, plus the rendering test), with 100% statements, branches, functions and lines on changed logic (`view.ts`, `e2e/github.ts`). Both touched Playwright specs compile/list (5 tests); no browser e2e or production e2e ran. No public SDK API changed, so docs generation and a changeset are not needed.

Codex Astra reviewed the finished diff with no actionable findings. Fable review was attempted: the default CLI is signed out, and `claude-rr` reports every account failed or cooling. No account configuration was changed. Delivery is one local commit on `mini/prod-multirepo`; no push or deploy.

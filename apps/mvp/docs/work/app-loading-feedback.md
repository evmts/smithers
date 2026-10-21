---
title: Consistent loading and hover preloading
status: in-progress
area: app
owner: loading-pattern builder (Claude Opus, lead-assigned)
updated: 2026-10-20
links: [navigate-flow.md, repo-view-branches-raw-clone.md, notifications-and-live-work.md, ../rulings.md]
---

## Current state — 2026-10-20, 22:10 PDT

**What:** One calm loading pattern app-wide, navigation that keeps the page until the next is ready, and preload on hover ([decision 0020](../decisions/0020-one-loading-pattern.md), [navigation](../features/navigation.md)).

**Done:**
- `@smthrs/ui`: `LoadingBar` and `LOADING_DELAY_MS` (300 ms); `Skeleton` hidden for 300 ms then a gentle pulse; `Spinner` and the typing dots deleted; Button, PromptInput, RefPicker, RepositoryHome, IssuesView, ItemConversation, RepoView and the pending answer moved to the pattern; Working no longer pulses. The styleguide's reduced-motion policy keeps a `--motion-hold`.
- App: routes warm, then open, in `beforeLoad`; `defaultPreload: "intent"` (50 ms) plus `IntentPreload` for plain links; Root's page bar; skeletons in place of the blank repository body; no spinner left in `apps/mvp`; the first paint is the theme's background, never white.
- Tests: `browser/loading.browser.test.ts` (no paint under 300 ms, no layout shift, reduced motion), `src/features/repo/warm.test.ts`, issues and todos warm tests, `firstPaint.test.ts`, and the navigate e2e's never-blank and hover tests.

**Proof so far (22:10):** `navigate by the agent` passed on the MacBook with the never-blank frame check, re-recorded to `~/Desktop/smithers-mvp/videos/navigate/navigate-by-the-agent.mp4`; `navigate by hover` passed (21:15); UI browser probes 4/4; `warm.test.ts` 6/6; issues and todos warm tests pass.

**Follow-ups (status: todo, after the 22:05 test pause lifts):**
- Re-record `navigate by a person` passing: the 21:15 GIF on the Desktop is from a run where the shared dev server's app never opened.
- One coverage run of `src/features/repo/actions.ts`, `src/features/home/actions.ts` and the issues and todos `warm`.
- `pnpm docs:check`: the `docs-sync` flow fails to launch ("The body of flow docs-sync could not be loaded"), and `smthrs docs //packages/smithers/ui:docs` answers target not found.
- `repo.test.ts` "fails busy, and navigating to it again loads it again": its scripted `listFiles` fault is consumed before the tab's read since another lane's `RepoReads` change; `warm.test.ts` proves the same path with an injected client.

**Not in this note's scope:** clone progress through durable notifications (the 18:16 repo review) stays with the clone workflow's owner.

**Open questions for Will:** None.

## Specification — 2026-10-20, 18:18 PDT

**What:** Use one calm app-wide loading pattern, retain useful content and preload on hover where appropriate.

**Why:** Will repeatedly rejected janky spinners; the 18:16 repo review adds hover preloading and clone workflow notifications.

**Current state:** At 18:10–18:12 the lead assigned navigate investigation and app-wide indicator replacement. The latest repo feedback adds scope; no completed fix receipt.

**Next step:** Delay visible loading by 300 ms, then use a stable bar or placeholder; keep navigation content until ready. Route clone progress through durable notifications; prove no flash, no layout shift and visible destinations.

**Open questions for Will:** None; the recorded requests settle product intent.

Evidence: script-filtered user text and lead replies from the latest two session hours; queue answers through 2026-10-21 01:16:08 UTC; current rulings, decisions, proposals, TODOs, rules and shared panel briefs/designs. Later rulings override historical proposals. Product receipts are reported evidence; this pass validates the site build only.

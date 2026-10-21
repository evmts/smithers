---
title: A repository's own home view (M-45)
status: in-progress
area: app
owner: home builder; Opus designs Effect example
updated: 2026-10-21 02:06 PDT
links: [land-to-main.md, ../decisions/0014-flows-authoring-debugging-and-home-view.md, old-app-feature-gaps.md, flow-authoring.md, flow-debugging.md, repo-clone-and-view.md, repo-view-branches-raw-clone.md, agent-ui-rendering.md, roles-and-labels.md, decisions-for-will.md, ../decisions/0004-agent-ui-codemode-and-rendering.md, ../decisions/0006-repo-clone-and-view.md, ../proposals/mvp-gaps.md, ../rulings.md, chaptered-review-videos.md, everything-is-a-plugin.md, effect-repository-home.md]
---

## Tracker reconciliation — 2026-10-21 02:06 PDT

**What:** Repository home views for visitors, contributors and maintainers.

**Why:** The production VibeLang factory needs a usable repository front page.

**Current state:** Repository homes landed in c6940ac5 according to the 01:49 PDT lead update. Production completion is unreported. The highest authorized audience remains the default; the requested downward audience switcher is a separate unfinished follow-up. VibeLang App coverage was confirmed by GitHub at 01:38, but its production import is still unproven.

**Next step:** Smoke-test the deployed repository homes and VibeLang import; finish the audience switcher under server authorization.

**Open questions for Will:** None.

Evidence: session 6253ecf2 user-typed text and lead replies extracted by script for the latest two hours through 2026-10-21 09:03:39 UTC; current rulings, queue answers, shared briefs/designs and retained builder receipts. Product tests are reported evidence; tracker validation is the site build. Execution owner retained.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 19:50 PDT

**What:** Repository homes at landing-page quality, for three audiences: a visitor's landing page, a contributor's way in, a maintainer's day with New branch. VibeLang's own `.smithers/home.json` is the flagship; Effect's is Smithers' curated home.

**Why:** Will, 17:38 on the first recording: "the home page doesn't look good … be more thoughtful about what features we might show a maintainer … or a user … a home page for a known repo … landing page quality for say effect.ts"; 18:12: "The maintainer should have a prominent button to start working on a new branch"; 19:02: VibeLang first, with "great contributor and maintainer pages"; 19:41: "make the coding factory simpler".

**Current state:**
- Mock: [design/repo-home/repo-home.html](../design/repo-home/repo-home.html) (VibeLang and Effect, visitor, contributor and maintainer, light and dark, phone width), with the simpler factory chain.
- Built: sections and audiences (`everyone`, `contributor`, `maintainer`, and `"contributors": "anyone"`) in `@smthrs/views`, now published and the one format `@smthrs/targets` writes; `RepositoryHome` restyled with `hero`, `code`, `cards`, `stats`, `releases`, `action` and the live `issues`, `stack`, `runs`, `flows` blocks; ChatApi's `GET /api/repos/<owner>/<name>/home` deciding the audience and serving curated homes from data (`worker/home/curated/`); Effect's curated home; New branch (`branch/create`, `/branch.new`, Code Storage `createBranch`).
- VibeLang's home is drafted at [design/repo-home/vibelang.home.json](../design/repo-home/vibelang.home.json) for the VibeLang session to commit; it reads as a home in `view.test.ts`.

**Proof:** `e2e/home-effect.spec.ts` passed on the mini at 23:30 (visitor, contributor, maintainer; New branch skipped), with chaptered recordings in `~/Desktop/smithers-mvp/videos/home-effect/` and GIFs `home-effect-{visitor,contributor,maintainer}.gif`.

**Next step:** the follow-ups below.

**Follow-ups (status: todo), cut at the burn-down, 2026-10-20 22:00:**
- New branch's e2e skips locally: this machine has no `CODE_STORAGE_ORG` or `CODE_STORAGE_KEY`. Run it against the deployment (`BASE_URL`), which has both; `worker/branch/Branches.test.ts` and `src/features/home/live.test.ts` cover it on scripted Code Storage.
- Re-record the public API baseline for `@smthrs/views` and `@smthrs/targets` (`check-api-baseline.mjs --build-declarations --update`).
- Build the issue lifecycle's chain from the mock (repro, accepted, commitment, POC, TODO) once its decision record lands.
- The audience comes from the person's app-wide role; per-repository roles and who is on which branch wait for those shapes.

## Prior tracker record (retained)


## Current specification — 2026-10-20, 18:26 PDT

**What:** Provide polished repository homes with role-appropriate content and one shared home schema.

**Why:** Will requested an Effect-quality example and has now settled publication and fixture retention.

**Current state:** Original home tests pass; design refinement remains open. At 18:23–18:24 Will approved publishing @smthrs/views with the next release and retaining smithersai/home-fixture publicly. These are no longer blockers.

**Next step:** Finish the Effect home revision and New branch action; complete views-public-release.md to remove the duplicate schema. Flows/stack/view blocks still need renderers and tests.

**Open questions for Will:** None.

Evidence: latest two session hours extracted by script as human text/lead replies; queue answers through 2026-10-21 01:24:15 UTC, current rulings, shared briefs/designs, decisions, proposals, TODOs and rules. Latest rulings override historical proposals. Product results are reported receipts; this pass verifies the maintainer-site build only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:34 PDT

**What:** Provide a repository home with polished role-appropriate content.

**Why:** Will says the feature works but rejects its visual quality and asks for an Effect example.

**Current state:** Both original home browser tests pass; supported blocks remain text, links, Markdown, prompts and apps. Will’s 17:31 changes request reopens design quality. Flows/stack/view blocks still lack renderers.

**Next step:** Build the mock-first Effect example tracked separately; retain Code/file-tree fallback and tests, then return revised videos. Resolve duplicate format via views publishing.

**Open questions for Will:** Publish @smthrs/views to remove the duplicate format? Keep smithersai/home-fixture? Neither answer is recorded.

Evidence: queue answers through 2026-10-21 00:34:14 UTC; script-filtered human text and lead replies from the latest two transcript hours through 00:33:48 UTC; current rulings, decisions, proposals, TODOs, rules and shared briefs. Latest answers supersede older blockers. Product tests are reported evidence; this tracker runs the maintainer-site build only.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 16:35 PDT

**What:** Show .smithers/home.json text, links, Markdown files, prompts and app buttons; retain the Code tab and file-tree fallback.

**Why:** Repositories can declare their own home; Will needs a working demonstration.

**Current state:** At 16:34 the lead confirmed both browser tests pass. Re-recording fixed semantic Markdown headings, closed composer on prompt/app actions, Clone flashing on cloned repositories and colliding recording filenames. Flows, stack and view blocks are not rendered yet. The original failed demo came from the dev stack.

**Next step:** Collect Will’s revised-video feedback; track unsupported blocks through the public plugin design. Remove the duplicate home format only after the views publishing decision.

**Open questions for Will:** Publish @smthrs/views to remove the duplicate home format? Keep the public smithersai/home-fixture test repository? Both are queued; neither is approved.

Evidence: lead text replies extracted by script from the session’s latest two hours through 23:34:16 UTC; current rulings and queue answers take precedence over older designs. Reported product-test receipts only; this tracker ran no product tests.

## Prior tracker record (retained)


## Current specification — 2026-10-20, 15:24 PDT

**What:** Render a repository-declared home view, retaining access to its files.

**Why:** Will reported that the original demo did not work.

**Current state:** The missing Code Storage credentials were restored with stack recovery at 15:17:27. At 15:22:54 the lead reported two re-recorded chaptered home videos, covering repositories with and without a home, queued for Will’s re-check. Earlier 14-test and flows-browser receipts remain below. This is reported completion, not Will’s acceptance.

**Next step:** Collect Will’s review of both revised videos; route shell changes through the pending public plugin design.

**Open questions for Will:** Feedback on the revised home walkthroughs.

Evidence: Will’s typed messages and lead text replies, extracted from session `6253ecf2` for its latest two hours through 15:23:55 PDT; [rulings](../rulings.md), queue answers through 14:36 PDT, shared briefs/designs and current decisions, proposals, TODOs and rules. Receipts above are reported, not fresh product tests run by this tracker.

## Earlier tracker history


## Current specification — 2026-10-20, 14:55 PDT

**What:** Allow a repository’s declared home with the file tree available.

**Why:** Will reported that the demo did not work.

**Current state:** At 14:39 the lead traced broken repo pages to the dev server missing its Code Storage key; 14 unit tests and the flows browser test were reported passing. Two home tests overwrote the same recording; they now use separate names. The restart still waits at 14:53.

**Next step:** Restore credentials, prove the home in the browser and re-record separately named chaptered videos. Shell contribution design follows the plugin panel.

**Open questions for Will:** None; the lead can settle implementation details.

Evidence: Will's typed messages and the lead's text updates in session `6253ecf2`, 12:54–14:55 PDT; [rulings](../rulings.md); queue answers through 14:36 PDT. These are reported receipts, not a new verification run by the tracker.

## Earlier tracker history

Previous owner record: repository home builder; stopped by the usage limit at 14:16 and resumed at 14:19 on 2026-10-20; since 14:27 it checks the home GIF frame by frame after Will's "I don't think the demo worked", fixes the product and records it again. Until 14:30: repository home builder; on the home view since the flows e2e passed at 13:20:39 on 2026-10-20; W3, W2 and W6's files and `e2e/home.spec.ts` on disk by 13:44; unreported by 13:52. Until 13:46: repository home builder, started by the lead about 13:09 on 2026-10-20 ("an agent is building the repository home view"); it runs the flows e2e first; no home view file on disk by 13:17. Until 13:09: 0014's builder, which reported the first slice at 13:05 without the home view and named it the next step. Until 13:05: 0014's builder, resumed by the lead at 10:42 on 2026-10-20 from where it stopped (the Claude usage limit stopped it from about 08:15 to 10:40); the home view follows the walking skeleton. Until 10:42: 0014's builder, the walking skeleton from 07:30:21 on 2026-10-20 (the lead to Will); nothing on disk by 07:37; unreported. Until 07:30: Panel F; decision 0014 written 07:02:13 on 2026-10-20 (status: proposed), decision 10; no builder yet. Until 07:02: Panel F (Opus merges into decision 0014, flows authoring, debugging and the home view; started 06:42:06 on 2026-10-20). Sol's design done 06:43; Opus's independent design written 06:56:49. Until 06:42: unassigned


## What

A repository declares what its page shows instead of the plain file tree.

**Decided in 0014 (07:02, proposed), decision 10:** a repository's home is data at `.smithers/home.json` on the default branch's head. Its blocks are the old app's (v4) vocabulary, whose schema moves to `@smthrs/views` as `Home`, and `@smthrs/ui` renders them natively. The tree is one tab away (Home and Code tabs), and `/tree/` and `/blob/` links open what they name. A `view` block draws a flow's `view.tsx` through 0004's realm and frame, in phase 3 (L3). Arriving at a home runs no flow. Proof F5: a fixture repository's `.smithers/home.json` draws its blocks.

That is data blocks first, this note's earlier recommendation, not Sol's declared view.

**From 06:39 on 2026-10-20 this is Panel F's item 3.** Will: "ability to create a repositories own home view is important." Best guess from Sol's design (scratchpad `final/panel-f-sol.md`), before 0014:

```
.smithers/home.json   { kind: "view", path: ".smithers/views/home.tsx" }   or   { kind: "flow", name: "home" }
        │ read at the repository's activated default-branch revision
        ▼
@smthrs/views GeneratedView (0004's pure realm) ── declared events ──▶ ordinary admitted flows
        no declaration ─▶ the file tree          broken ─▶ "Home unavailable" + Files
```

- **A declaration, never a code launch.** `.smithers/home.json` is a closed union: a view file, or a flow whose declared presentation view is used (not its executable body).
- **Rendering:** through `@smthrs/views` and `GeneratedView`; nothing runs on page load; buttons call ordinary flows under the viewer's role.
- **Fallbacks:** no declaration shows the tree silently; a failed home shows `Home unavailable` and Files; an invalid new home shows the tree, not a stale one. `tree` and `blob` links still open what they name.
- **Flow:** `repo/home { repoId, revision }`, readable by anyone who can read the repository, signed-out readers included.

This answers this note's earlier question differently from its recommendation: Sol picks a declared view in 0004's realm, not the old app's data-only blocks.

The original gap, as the audit wrote it at 06:10:

Old app:
- The repository declares home blocks in `.smithers/factory.json` (`apps/app/src/mainview/cards/RepositoryHomeView.tsx`, `repository/CodeHome.tsx`), drawn in this order: text, a prompt box, links, Markdown boxes, the live stack, flows with buttons, and app buttons (issue, review, schedule, wiki).
- The blocks are data, not code. A button runs its flow only when a person presses it, under that person's role.
- A missing or broken declaration leaves the tree with one sentence. Files stay reachable.
- A flow can declare a view that its runs show (`cards/RunTraceCard.tsx`, `RunFlowView`).

Spec M-45 and mvp.md §6.16 and §6.17: "a repository's own flow or custom UI can replace that view".

Already planned, so not part of this gap: the agent's templates and generated views (decision 0004), and authoring flows (`mvp-gaps.md` item 8).

Not planned: a repository replacing its landing view.

## Why

- Customizing is the product ("everything is a flow"), and M-45 names this view.
- Our own repository could open on its stack and its flows instead of a file list.

## How it fits

- The declaration is read through `repo/read` at the default branch's head.
- Blocks render through decision 0004's template path (our React, no model call). Buttons dispatch flows under the viewer's actor and role (decision 0007).
- The tree stays one click away. `tree` and `blob` deep links still open what they name.

## Size

M.

## State

- 06:10 on 2026-10-20: the old-app audit wrote this note as gap 15 (`status: idea`).
- **06:39:05:** Will: "ability to create a repositories own home view is important."
- 06:40: Sol's run started. 06:42:06: the lead started Panel F's Opus member and merger. Status moved from `idea` to `designing`.
- 06:43: Sol's design finished (exit 0), with the home view as decision 8. It names no question for Will.
- By 06:55: `0014-flows-authoring-debugging-and-home-view.md` isn't written.
- **07:02:13: decision 0014 written (status: proposed).** It settles this note's question as data blocks first, with a `view` block in phase 3.
- **07:30:21 on 2026-10-20, Panel F done; the lead to Will:** "The flows design is done (decision 0014), and building its first slice has started." Its list includes "**Repository home:** a repository's own home page comes from a small data file in the repository, with the file tree one tab away." In 0014 §9 the home isn't one of the walking skeleton's five steps: W3 (the `Home` schema), W2's `repository-home` and W6 (the Home and Code tabs) follow it, and F5 proves it.
- By 07:37: no `Home` schema in `@smthrs/views` and no `src/features/home/` on disk.
- **Status moved from designing to in-progress** with the lead's 07:30:21 start of 0014's first slice.
- By 08:07 on 2026-10-20: the walking skeleton's steps 1 to 5 are partly on disk ([flow authoring](flow-authoring.md)); no home view file yet (no `home.json` or `repository-home` in `apps/mvp/src` or `@smthrs/ui`).
- About 08:15 to 10:40 on 2026-10-20: the Claude usage limit stopped 0014's builder; the lead resumed it at 10:42 ([flow authoring](flow-authoring.md)). By 10:44 still no home view file.
- **13:05 on 2026-10-20: 0014's builder reported the first slice without the home view** ([flow authoring](flow-authoring.md)). Its next step: "`@smthrs/views` `Home`, a `RepositoryHome` component, and `.smithers/home.json` read at the head on `/$owner/$repo`, with the tree one tab away."
- **About 13:09, the lead to Will:** "an agent is building the repository home view. A repository's `.smithers/home.json` replaces its opening page, and the file tree stays one tab away. The same agent will run the flows browser test first."
- 13:12:05 to 13:16:44: the new builder ran `e2e/flows.spec.ts` (failed at 13:12:56) and changed `src/features/flows-ui/` ([flow authoring](flow-authoring.md)). By 13:17 no `Home` schema, `RepositoryHome` or `home.json` on disk (scratchpad `home-view/` holds only its e2e runs).
- 13:20:39 on 2026-10-20: the flows e2e passed ([flow authoring](flow-authoring.md)), so the builder moved to the home view.
- On disk, unreported: W3, the `Home` schema in `@smthrs/views` (`packages/smithers/ui/views/src/Home.ts` 13:24:31, tests `Home.test.ts`, `Home.property.test.ts`, `HomeTargets.test.ts` 13:26:09, docs `read-a-home.md`); W2, `RepositoryHome` in `@smthrs/ui` (`src/repository-home/RepositoryHome.tsx` 13:31:39, `tests/repository-home.test.tsx`, guide `show-a-repository-home.md` 13:32:08). W6 in `apps/mvp`, unreported: `src/features/home/` `view.test.ts` (13:40:32), `actions.ts` (13:40:55) and `home.test.ts` (13:41:09), and `e2e/home.spec.ts` (13:44:25, two tests). No e2e result by 13:52.
- Before 14:27 on 2026-10-20 a home view GIF reached Will's queue (`gif:repo-home@f8e4`, "Watch: a repository's own home page"); no builder report is on record.
- 14:15 to 14:17 on 2026-10-20: the session usage limit stopped this agent with 12 others; the lead resumed all 13 at 14:19.
- **14:27:10, Will (queue, on the home GIF):** "I don't think the demo worked".
- **14:27:52, the lead:** "the home-view agent is checking that GIF frame by frame. It will fix the product, not the recording, then record it again." 14:26: scratchpad `home-view/heavy-e2e.sh` and an empty `home2.log` (a rerun queued behind the shared test lock).

## Next

From 14:30 on 2026-10-20: the builder finds why the demo failed, fixes the product with a test that fails first, reruns `e2e/home.spec.ts` and records a new GIF; the curator then queues a `verify` item for Will.

Until 14:30 on 2026-10-20 the next step was, from 13:32 on 2026-10-20: W6, the Home and Code tabs on `/$owner/$repo` reading `.smithers/home.json` at the default branch's head; then proof F5 in a real-browser e2e with its GIF, and the builder's report.

Until 13:46 on 2026-10-20 the next step was, from 13:09 on 2026-10-20: after the flows e2e passes, the repository home builder adds the `Home` schema to `@smthrs/views` (W3), `RepositoryHome` to `@smthrs/ui` (W2) and the Home and Code tabs on `/$owner/$repo` (W6), reading `.smithers/home.json` at the default branch's head. Proof F5: a fixture repository's `home.json` draws its blocks, with the tree one tab away, in a real-browser e2e with its GIF.

Until 13:09 on 2026-10-20 the next step was, from 07:30 on 2026-10-20: after the walking skeleton ([flow authoring](flow-authoring.md)), W3, W2 and W6 build it. Proof F5: a fixture repository's `.smithers/home.json` draws its blocks, with the tree one tab away.

Until 07:30 on 2026-10-20 the next step was, from 07:02 on 2026-10-20: 0014's workstreams W3 (the `Home` schema in `@smthrs/views`), W2 (`repository-home` in `@smthrs/ui`) and W6 (the app's Home and Code tabs) build it after the walking skeleton.

Until 07:02 the next step was: Opus merges both designs into 0014. Sol's walking skeleton ends with the new flow supplying a pure home view with a Files fallback, after [flow authoring](flow-authoring.md) activates it.

## Questions for Will

- Data-only blocks, as in the old app, or may a repository flow render a decision 0004 view in the sandboxed frame? Recommended: data-only blocks first. (06:43 on 2026-10-20: Sol's panel design chooses a declared 0004 view with no code launch; the 0014 merge settles it, so this isn't asked yet. 07:02: 0014 settles it as data blocks first, with a `view` block later.)
- Panel F sends at most 3 questions with 0014. (07:02: 0014 has one, on personal flows; none on the home view.)

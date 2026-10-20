---
title: A repository's own home view (M-45)
status: in-progress
area: app
owner: repository home builder, started by the lead about 13:09 on 2026-10-20 ("an agent is building the repository home view"); it runs the flows e2e first; no home view file on disk by 13:17. Until 13:09: 0014's builder, which reported the first slice at 13:05 without the home view and named it the next step. Until 13:05: 0014's builder, resumed by the lead at 10:42 on 2026-10-20 from where it stopped (the Claude usage limit stopped it from about 08:15 to 10:40); the home view follows the walking skeleton. Until 10:42: 0014's builder, the walking skeleton from 07:30:21 on 2026-10-20 (the lead to Will); nothing on disk by 07:37; unreported. Until 07:30: Panel F; decision 0014 written 07:02:13 on 2026-10-20 (status: proposed), decision 10; no builder yet. Until 07:02: Panel F (Opus merges into decision 0014, flows authoring, debugging and the home view; started 06:42:06 on 2026-10-20). Sol's design done 06:43; Opus's independent design written 06:56:49. Until 06:42: unassigned
updated: 2026-10-20
links: [land-to-main.md, ../decisions/0014-flows-authoring-debugging-and-home-view.md, old-app-feature-gaps.md, flow-authoring.md, flow-debugging.md, repo-clone-and-view.md, repo-view-branches-raw-clone.md, agent-ui-rendering.md, roles-and-labels.md, decisions-for-will.md, ../decisions/0004-agent-ui-codemode-and-rendering.md, ../decisions/0006-repo-clone-and-view.md, ../proposals/mvp-gaps.md]
---

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

## Next

From 13:09 on 2026-10-20: after the flows e2e passes, the repository home builder adds the `Home` schema to `@smthrs/views` (W3), `RepositoryHome` to `@smthrs/ui` (W2) and the Home and Code tabs on `/$owner/$repo` (W6), reading `.smithers/home.json` at the default branch's head. Proof F5: a fixture repository's `home.json` draws its blocks, with the tree one tab away, in a real-browser e2e with its GIF.

Until 13:09 on 2026-10-20 the next step was, from 07:30 on 2026-10-20: after the walking skeleton ([flow authoring](flow-authoring.md)), W3, W2 and W6 build it. Proof F5: a fixture repository's `.smithers/home.json` draws its blocks, with the tree one tab away.

Until 07:30 on 2026-10-20 the next step was, from 07:02 on 2026-10-20: 0014's workstreams W3 (the `Home` schema in `@smthrs/views`), W2 (`repository-home` in `@smthrs/ui`) and W6 (the app's Home and Code tabs) build it after the walking skeleton.

Until 07:02 the next step was: Opus merges both designs into 0014. Sol's walking skeleton ends with the new flow supplying a pure home view with a Files fallback, after [flow authoring](flow-authoring.md) activates it.

## Questions for Will

- Data-only blocks, as in the old app, or may a repository flow render a decision 0004 view in the sandboxed frame? Recommended: data-only blocks first. (06:43 on 2026-10-20: Sol's panel design chooses a declared 0004 view with no code launch; the 0014 merge settles it, so this isn't asked yet. 07:02: 0014 settles it as data blocks first, with a `view` block later.)
- Panel F sends at most 3 questions with 0014. (07:02: 0014 has one, on personal flows; none on the home view.)

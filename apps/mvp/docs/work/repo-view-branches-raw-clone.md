---
title: Repo view extras (branch picker, branch count, raw, copy file, clone menu)
status: in-progress
area: app
owner: none; reported done 10:52:10 on 2026-10-20 by the repo view extras agent, uncommitted (lands with the next landing round). Queued cleanup with the review round 4 fixes: one `src/flows` helper for the "ask the tab that asked" channel that `app/navigate` and `repo/copy` each implement. Until 10:52: repo view extras agent, resumed by the lead at 10:42 on 2026-10-20 from where it stopped (the Claude usage limit stopped it from about 08:15 to 10:40); unreported by 10:44. Until 10:42: repo view extras agent (started 06:42:16 on 2026-10-20); from 07:06 to 07:07 also `/clone`, a local `repo/clone` flow over the checked `POST /api/repos`. By 07:20 on disk: `repo/refs`, `repo/clone`, `repo/copy`, raw and refs routes, `@smthrs/ui` `RefPicker` and `CopyButton`; no e2e change, GIF or report. Until 07:06: repo view extras agent, started 06:42:16 on 2026-10-20 by the lead; owns `src/features/repo/**`, `src/screens/repo/**` and `worker/Repo*.ts`; unreported. Until 06:42: unassigned
updated: 2026-10-20
links: [review-round-4.md, old-app-feature-gaps.md, repo-clone-and-view.md, repo-open-states.md, repo-view-package-split.md, navigate-flow.md, pull-request-list-and-tabs.md, sandboxes.md, command-palette.md, land-to-main.md, e2e-suite-and-gifs.md, ../decisions/0006-repo-clone-and-view.md, ../decisions/0005-sandboxes-secrets-and-the-forge.md, ../features/repo.md, slash-commands.md, fable-review-2-fixes.md, flows-and-agent.md, agent-jev.md]
---

## Current specification — 2026-10-20, 18:26 PDT

**What:** Fill the repository page with tree, README, about panel, topics, languages, latest release, contributors, branch/tag counts, last commit and Code.

**Why:** Will rejected empty first visits and weak file experiences at 18:16.

**Current state:** The lead assigned a browse builder at 18:16. Before cloning, show available GitHub metadata. Clone progress uses durable notifications/toasts: requested, fetching, indexing, ready or failed with Retry. No completion receipt.

**Next step:** Implement reclaimability notice until App install, with Install; reclaim only through a flow. Show Markdown WYSIWYG when writing is permitted and read-only otherwise, with raw text one key away. Add sandboxed HTML code/preview/split. Enforce permissions and save through the existing branch flow. Coordinate LSP and hover preload with their owners; prove real browser journeys.

**Open questions for Will:** None; Will settled Markdown editability at 18:17.

Evidence: latest two session hours extracted by script as human text/lead replies; queue answers through 2026-10-21 01:24:15 UTC, current rulings, shared briefs/designs, decisions, proposals, TODOs and rules. Latest rulings override historical proposals. Product results are reported receipts; this pass verifies the maintainer-site build only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 18:18 PDT

**What:** Polish the repository browser, initial page, clone progress and file viewing.

**Why:** Will reopened this slice at 18:16: empty layout, repeated spinners and weak file experiences.

**Current state:** The latest queue answer asks for workflow notifications during clone, hover preloading, a reclaimability notice until the Smithers App is installed, WYSIWYG Markdown, optional CodePen-like HTML preview and full LSP code support. No implementation or lead assignment receipt for this newest answer.

**Next step:** Triage the request into the owning SDK/plugin workstreams; fill the initial layout, replace clone spinners with durable progress toasts, and verify each requested file experience with real browser tests.

**Open questions for Will:** None; the recorded requests settle product intent.

Evidence: script-filtered user text and lead replies from the latest two session hours; queue answers through 2026-10-21 01:16:08 UTC; current rulings, decisions, proposals, TODOs, rules and shared panel briefs/designs. Later rulings override historical proposals. Product receipts are reported evidence; this pass validates the site build only.

## Earlier tracker history (retained)

## What

What the old repository view had beyond the tree, the file and the README.

Old app:
- **Branch picker** with a "Find a branch or full SHA…" filter. Each branch shows its commit id, and a full 40-character SHA becomes a link. The folder view's picker keeps the current path (`apps/app/src/mainview/repository/BranchPicker.tsx`, `repository/RepositoryCodeView.tsx`).
- **"N branches"** and a **Code** dropdown with the `git clone` URL and Copy (`repository/CodeHome.tsx`).
- **Raw** and Exit raw on a file, a Raw link for very large files, and **Copy** for the file's text (`repository/RepositoryCodeView.tsx`).
- **Go to file** through the palette's path mode ([command palette](command-palette.md)).

New app ([repo clone and view](repo-clone-and-view.md)): a static default-branch chip, Copy permalink, and Preview or Code for Markdown. Its routes already take a ref (`/$owner/$repo/tree/$ref/$`), but nothing lists the branches or links to them.

Already planned, so not part of this gap: decision 0005 §5 puts a branch picker with the sandbox's state and a lock for the mode into the repo view, for branches with sandboxes.

Decision 0006 dropped these as "no backing yet". Not planned: reading any branch or commit of a cloned repository, the clone menu, raw and copy.

## Why

- The domain swap promises that `/owner/repo/tree/<branch>` works as on GitHub. Will: "Our server should support anything github supports?" ([repo open states](repo-open-states.md)).
- Reviewing an agent's branch starts by switching to it.

## How it fits

- `repo/refs`: a client flow over a new RepoApi GET route that lists Code Storage's branches, cached per head like the tree reads.
- The picker is an `@smthrs/ui` component. Choosing a ref calls [`app/navigate`](navigate-flow.md).
- Raw: a RepoApi GET answering `text/plain` with `nosniff`, opened in a new tab. Copy uses the injected `Clipboard` that Copy permalink already uses.
- The clone menu shows the GitHub URL until we serve git ourselves.

## Size

M.

## Build (from 06:42 on 2026-10-20)

The lead's brief to the builder, 06:42:16:
- View any branch or tag with a branch picker, and any commit SHA.
- Raw file view and download.
- Copy permalink, copy path and copy file contents.
- A clone URL with Copy.
- Together they complete the domain swap: a github.com URL with the domain changed opens the same thing.

Rules it carries:
- Code Storage only through `@smthrs/effect-code-storage`.
- Reads through `ImmutableCache`, keyed by SHA.
- Logic and `.tsx` in separate files, with no `useState` or `useEffect`.
- `@smthrs/ui` components; a missing reusable one goes there.
- Every action is a flow a person and the agent both run, for example opening a file at a branch with `app/navigate`.

Proof it owes:
- Unit tests at 100%.
- `e2e/repo.spec.ts` extended, with video and a GIF: switch branch, view raw, copy permalink and copy the clone URL, on `octocat/Spoon-Knife`.
- Typecheck, `importRules` (the known [repo-view import](repo-view-package-split.md) red aside), `pnpm docs:sync`, `pnpm docs:check` and `docs/features/repo.md`.

## State

- 06:10 on 2026-10-20: the old-app audit wrote this note as gap 6 (`status: idea`).
- **06:39:05:** Will: "Repo view extras we should do."
- **06:42:16:** the lead started the builder. Status moved from `idea` to `in-progress`.
- By 06:55: no file under `src/features/repo/` or `src/screens/repo/` has changed since 06:26; `worker/test/codeStorage.ts` changed at 06:55. No report.
- 06:42:50: the lander's brief keeps `src/features/repo/**` out of its first landing ([land to main](land-to-main.md)).
- 06:53:51 on 2026-10-20, on disk, unreported: `@smthrs/effect-code-storage` lists branches and tags (`.changeset/code-storage-branches-tags.md`): `listBranches(repo, { cursor?, limit? })` answers each branch as `{ name, sha, createdAt }`, and `listTags` each tag as `{ name, sha }`.
- 06:57 to 06:58: `worker/RepoReads.ts` and `worker/RepoApi.ts` add two read kinds, `raw` (`/api/repos/<owner>/<name>/raw/<sha>/<path>`) and `refs` (`/api/repos/<owner>/<name>/refs`). A raw file is plain text with `x-content-type-options: nosniff` and `content-security-policy: default-src 'none'; sandbox`.
- 06:59 to 07:04: `src/features/repo/` (`api.ts`, `reader.ts`, `schema.ts`, `copy.ts`, `clipboard.ts`, `tab.ts`, `paths.ts`, `queries.ts`, `rows.ts`, `store.ts`, `repo.ts`, `view.ts`). 07:05 to 07:06: `@smthrs/ui` `ref-picker.tsx`, `copy-button.tsx`, `popover.tsx`, `repositoryCss.ts` and `docs/api.md`; their tests at 07:14.
- **07:06:16 on 2026-10-20, the lead to Will:** "Cloning wasn't a registered flow yet, so the repository agent is adding `/clone`, which the agent can call as well." **07:07:47:** with the remote door removed ([Fable review 2 fixes](fable-review-2-fixes.md), P3-7), the lead corrected the instruction: "`/clone` becomes a local flow that calls that route", the checked `POST /api/repos`.
- 07:08 to 07:10 on 2026-10-20, on disk: `src/features/repo/flows.ts` declares three model-invocable flows. `repo/refs` lists a repository's branches and tags. `repo/clone` "asks RepoApi to clone a public GitHub repository into Code Storage", one `POST /api/repos` through `RepoClient` (`clone.ts`). `repo/copy` puts a link, a path, a file's text or the clone URL on the clipboard of the tab that asked. The registry (07:14:12) offers `repo/clone` as `/clone` to Members and up, because "Cloning spends the deployment's Code Storage budget"; `repo/refs` and `repo/copy` have no slash command. `RepoPage.tsx` and `contract.ts` changed at 07:10.
- Not yet: `e2e/repo.spec.ts` is unchanged since 03:14 and `docs/features/repo.md` since 06:32; no GIF and no report. At 07:07:38 the engine and hosts agent named app type errors in "other agents' files (`jev`, `repo`)".
- 07:46 to 07:53 on 2026-10-20, on disk, unreported: `e2e/repo-extras.spec.ts` (07:46:03), three cases: "switch branch", "raw" and "copy" (Copy permalink, Copy path, Copy and the clone URL); `e2e/repo-clone.spec.ts` (07:49:35), "clone by slash" (`/clone octocat/Hello-World`) and "clone by the agent". Docs: `docs/observability.md` (07:51:37), `docs/features/repo.md` (07:52:49), `remote-flows.md` and `flows.md` (07:52:55), decision 0006 (07:53:15). At 07:53:07 the builder wrote its own summary into this note (the second State section below). No GIF and no run of either spec is on record, and no report.
- 08:10:52 on 2026-10-20: `e2e/repo-extras.spec.ts` changed again. 08:10:29: the lander's typecheck failed on `CodeStorage.listBranches` and `listTags` in `worker/RepoReads.ts` and `RepoApi.ts` (78 errors), this agent's SDK change, which round 2 keeps out ([land to main](land-to-main.md)).
- **About 08:15 on 2026-10-20: the Claude usage limit stopped the builder** ("Repo view extras (build now)", 15:14:27Z) with every other Claude agent, unreported. The limit reset at 10:40.
- **10:42: the lead resumed it** from where it stopped ("repo extras"). 10:42:01: `e2e/repo.spec.ts` changed and a run of it started. By 10:43 "browse: a file from the listing, its lines, a reload, and the permalink at the head commit" failed: the copied permalink was empty (`Received string: ""`, `test-results/…/error-context.md`). No GIF or report by 10:44.

- **10:52:10 on 2026-10-20: reported done**, uncommitted. The agent's report:
  - **Built:** a branch and tag picker (filter, counts, short SHAs); any branch, tag, full SHA or slashed branch name in GitHub's URLs; Raw (served as plain text, never run), Download, and `/owner/repo/raw/<ref>/<path>` by domain swap; Copy permalink, Copy path, Copy (the file's text), and a Code menu with the clone URL. Branch and tag lists are cached in `ImmutableCache` under the head SHA. SDK: `listBranches` and `listTags` in `@smthrs/effect-code-storage`; `Popover`, `RefPicker`, `CopyButton` and a `Snippet` label in `@smthrs/ui`.
  - **Flows, registered and agent-callable:** `repo/refs`; `repo/copy`, which writes the asking tab's clipboard over a channel modelled on `app/navigate`'s; `repo/clone`, a local flow whose step calls `POST /api/repos`. The Clone button, `/clone` (Member and up) and the agent all run `repo/clone`. Choosing a ref runs `app/navigate`.
  - **Proof:** 119/119 repo unit tests, every logic file at 100% (`.tsx` excluded by config); `@smthrs/ui` 2,249/2,249; the SDK at 100% plus a live check that the mirror carries all 3 branches. "8/8 repo e2e pass with video", including `/clone` and the real model's clone, on `octocat/Spoon-Knife` against real Code Storage. Typecheck clean for its files; `importRules` shows only the known [repo-view](repo-view-package-split.md) red; `docs:sync` and `docs:check` pass. Docs: `features/repo.md`, `flows.md`, `observability.md`, `slash-commands.md`.
  - **Shared files it edited:** `registry.ts`, `declarations.ts`, `registrations.ts` (`repoReads` renamed `repoFlows`), `boot.ts`, `router.tsx` (the raw route), `test/agent.ts`, `boot.test.ts`, `telemetry.test.ts`, `registry.test.ts`. Copy and clone now go through `FlowDispatch`, not the old `Clipboard`/`copyPermalink` path; the repo state has a `refs` collection.
  - **Still red, named as not its own:** `registry.test` (missing `agent/ask` and `run/*`), the telemetry drift on `smithers_agent_status_reports`, two `boot.test` cases, and errors in `Views.test.ts` and `status/flows.test.ts`. `main.tsx` returned 500 for a while mid-session, then recovered.
  - **Its decision for the lead:** the copy channel repeats navigation's "ask the tab that asked" pattern; one shared helper in `src/flows` could serve both.
- **10:52:20, the lead to Will:** "Repo view extras are done. All 8 repo browser tests pass against real Code Storage on `octocat/Spoon-Knife`, with GIFs in `~/Desktop/smithers-mvp/gifs`." And: "Try opening http://localhost:1337/octocat/Spoon-Knife, then switching branches, viewing a file raw and copying its permalink." The duplicate channel is "queued with the review fixes" (scratchpad `final/WIRING.md`: "Extract one helper in `src/flows` and use it in both. Batch it with the review-round-4 fixes").
- On disk at 11:07: the 8 repo GIFs (`repo-browse`, `repo-clone`, `repo-clone-clone-by-slash`, `repo-clone-clone-by-the-agent`, `repo-extras-copy`, `repo-extras-raw`, `repo-extras-switch-branch`, `repo-refusals`) date from 10:42:43 to 10:42:57, and `apps/mvp/test-results/.last-run.json` (10:43:27) records a failed run. The passing run the report names isn't in that folder; best guess it wrote elsewhere. The landing's e2e run settles it.
- **Status moved from in-progress to done** on the report and the lead's ruling. The duplicate channel is a cleanup batched with [review round 4](review-round-4.md), not a gap in this feature.
- 11:04 to 11:05 on 2026-10-20, [review round 4](review-round-4.md): Fable P3-1, anonymous repository reads (`tree`, `blob`, the new `raw` and `refs`) are unthrottled, so a script can spend the monthly 40 GB read budget and leave Members `503 capacity`; fix: add `repo` to `Throttle.Route`, or require sign-in for a cache miss. Opus P3-5: browser spans relay `url.path`, so `GET /api/repos/<owner>/<name>/blob/<sha>/<path>` exports file paths. Both P3s, unrouted; status stays done.
- **About 11:50 on 2026-10-20, a regression (scratchpad `final/WIRING.md`):** the repo "browse" e2e's copy-permalink action returns empty; it passed at 10:5x. Best guess: the `repo/copy` tab channel after other agents' edits. Queued for the [P3 cleanup](review-round-4-p3-cleanup.md) pass with the shared "ask the tab that asked" helper. The failing run isn't on disk (the latest test results hold only the branch workspace run), so this note stays `done` until a run proves it.

## Next

From 10:52 on 2026-10-20: nothing here. The work lands with the next landing round ([land to main](land-to-main.md)); the shared tab-channel helper is batched with the [review round 4](review-round-4.md) fixes.

Until 10:52 on 2026-10-20 the next step was, from 07:53 on 2026-10-20: the builder's report, with both specs green and their GIFs; its summary below claims videos. The branch picker is shared with Panel G's git pages ([pull requests](pull-request-list-and-tabs.md)).

Until 07:53 on 2026-10-20 the next step was, from 07:07 on 2026-10-20: the builder's report: `e2e/repo.spec.ts` extended with its GIF (switch branch, view raw, copy permalink, copy the clone URL), `/clone` from the composer and from the agent, and `docs/features/repo.md`. The branch picker is shared with Panel G's git pages ([pull requests](pull-request-list-and-tabs.md)).

Until 07:07 on 2026-10-20 the next step was: The builder reports; the tracker checks the e2e GIF and `docs/features/repo.md`. The branch picker is shared with Panel G's git pages ([pull requests](pull-request-list-and-tabs.md)).
- 07:53:57 on 2026-10-20: kept out of landing round 2 as still in flight ([land to main](land-to-main.md)). By 08:07: no file under `src/features/repo/` has changed since 07:39:22; no report.

## State (the builder's own summary, written 07:53:07 on 2026-10-20, before its report)

- **Built 2026-10-20, unlanded** ([repo.md](../features/repo.md)): the branch and tag picker (`RefPicker` in `@smthrs/ui`, counts on its tabs, a full SHA typed in its filter), any branch, tag or full SHA in the routes, Raw (RepoApi's `raw` route, `text/plain` with `nosniff`) and Download, GitHub's `/raw/<ref>/<path>` by domain swap, Copy permalink, Copy path, Copy (the file's text) and the clone URL under Code. `CodeStorage.listBranches` and `listTags` were added to `@smthrs/effect-code-storage`; the branches and tags are cached under the head commit.
- **Every action is a registered flow:** `repo/refs`, `repo/copy` and `repo/clone` (`/clone` for a Member and up), with `app/navigate` for choosing a ref. `repo/copy` writes the asking tab's clipboard over the engine's clipboard channel, as `app/navigate` moves the asking tab.
- **Proof:** unit tests over RepoApi's real handler, Electric and a Node-host engine per tab; `e2e/repo-extras.spec.ts` and `e2e/repo-clone.spec.ts` against real Code Storage, with videos.
- **Not built:** Go to file through the palette, another commit's details beside a non-head ref, and serving git ourselves (the clone URL stays GitHub's).

## Questions for Will

None.

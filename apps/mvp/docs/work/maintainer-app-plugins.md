---
title: Maintainer tracker and notes as a future wiki plugin
status: idea
area: app
owner: plugin builders after slice 0
updated: 2026-10-21 00:06 PDT
links: [../rulings.md, everything-is-a-plugin.md, will-decision-queue.md, maintainer-site.md, chaptered-review-videos.md]
---

## Tracker reconciliation — 2026-10-21 00:06 PDT

**What:** Defer the tracker and notes migration to the future wiki.

**Why:** PLUGIN-5 narrows the earlier P2 request; PLUGIN-4 promotes the review queue separately.

**Current state:** Will’s latest words keep the maintainer tracker and notes punted. They will likely become the wiki, which does not exist in the app. The product review queue is a separate active design stream.

**Next step:** Leave tracker/wiki implementation unscheduled; use product-review-queue.md for the promoted queue feature.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead replies from the last two session hours, through 00:05 PDT; queue answers through 00:05:48 PDT; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product checks are reported receipts, not checks executed by this tracker. Existing execution owners and history retained; Codex curates documentation only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 18:18 PDT

**What:** Move the dogfooded tracker, queue and reviews into Smithers through its public plugin interface.

**Why:** Will reaffirmed at 18:12 that Smithers should eventually be built within Smithers.

**Current state:** The present maintainer app is now the work-tracking authority. Migration is still future work after the app works; slice 0 credentials are underway, not a completed migration.

**Next step:** Complete credential enforcement, prove needs-you through the public interface, and migrate high-quality maintainer features with historical records intact.

**Open questions for Will:** None; the recorded requests settle product intent.

Evidence: script-filtered user text and lead replies from the latest two session hours; queue answers through 2026-10-21 01:16:08 UTC; current rulings, decisions, proposals, TODOs, rules and shared panel briefs/designs. Later rulings override historical proposals. Product receipts are reported evidence; this pass validates the site build only.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 18:04 PDT

**What:** Graduate the dogfooded queue, tracker and reviews into public product plugins and workflows over workflows.

**Why:** Will wants these features in the product once high quality.

**Current state:** The extra Astra/Fable design review is complete; core run-credential implementation started at 17:56. No queue/tracker migration implementation receipt exists. The first plugin remains needs-you over existing waits.

**Next step:** After slice 0, prove needs-you with host-owned action controls through the public interface; retain all answers and work history while later slices replace old paths. Design approval does not complete the migration.

**Open questions for Will:** None.

Evidence: lead text replies extracted by script from the latest two transcript hours through 2026-10-21 01:03:57 UTC; queue rulings through 00:42:06 UTC; current rulings and decision 0017 override historical panel proposals. Product checks and landing receipts are reported evidence; this tracker runs the maintainer-site build only.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 17:24 PDT

**What:** Graduate high-quality dogfooded maintainer features into public plugins and workflows over workflows.

**Why:** Will wants the queue, tracker and review in the product through the public interface.

**Current state:** The corrected 0017 incorporates Will’s dogfood-first answer. Slice 1 is a compiled needs-you skeleton over existing waits; durable asks and flows over flows follow in slice 2, review plugins in slice 4. All 13 Astra findings have design fixes, Fable remains pending, and migration implementation is unreported.

**Next step:** Finish Fable review, then prove the small first slice through public PluginHost queries and dispatch. Production waits for core run credentials. Preserve answer, work-note and review history as each later migration replaces its old path.

**Open questions for Will:** None.

Evidence: script-extracted user-typed text and lead replies from session 6253ecf2, latest two hours through 2026-10-21 00:23:43 UTC; queue answers through 00:06:34 UTC; current rulings and decision 0017, including its Astra fixes. Older briefs and proposals yield to these rulings. Completion and tests are reported evidence; this tracker validates the site build only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:14 PDT

**What:** Graduate the dogfooded maintainer queue, tracker and review into public product plugins and workflows.

**Why:** Will wants these in the product once they are high quality.

**Current state:** Will’s 17:06 answer supports a workflow running on top of coding and other long-running workflows to collect decisions and reviews. This supersedes the unanswered queue-for-everyone question; no migration is implemented. The current maintainer tool remains in use.

**Next step:** Fold workflow-over-workflows capability into 0017; complete extra reviews, then start needs-you over existing waits and run/answer. Preserve answer, tracker and review history throughout migration.

**Open questions for Will:** None.

Evidence: script-extracted human text and lead replies from session 6253ecf2, latest two hours through 2026-10-21 00:13:56 UTC; queue answers through 00:06:34 UTC; current rulings, decisions, proposals and shared briefs. Queue answers supersede older design proposals. Test results are lead-reported; this tracker runs the site build only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:05 PDT

**What:** Move queue, tracker and review into main-app plugins at P2.

**Why:** Will requested the maintainer features through the public plugin interface.

**Current state:** Will approved the merged plugin design at 17:03:52 PDT and requested extra Fable/Astra review. No migration implementation receipt exists.

**Next step:** Use the extra reviews to settle slice 1, then implement needs-you over existing waits and run/answer; preserve tracker, answer and review history in later slices.

**Open questions for Will:** No new migration question; individual design-choice items remain separately unanswered.

Evidence: queue answer `design:plugins-merged@1f45`, 2026-10-21 00:03:52 UTC, and the lead's 17:05 PDT `PLUGIN-REVIEW-BRIEF.md`. Will's latest answer outranks the older proposed-status wording in decision 0017. Review and implementation completion are not inferred.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 15:54 PDT

**What:** Move maintainer features into main-app plugins through the public interface.

**Why:** Will requested this at P2; core supplies primitives and first-party plugins get no private interface.

**Current state:** At 15:34 PDT the lead reported all four designs merged into decision 0017 and the visual review placed atop the queue. The panel is no longer waiting on Opus. No queue answer approves the design.

**Next step:** After Will reviews 0017, implement the proposed needs-you slice using existing run/answer; migrate tracker and reviews in later slices.

**Open questions for Will:** The three 0017 choices remain open: built-in React, sandbox-only repository code, and a queue for every person. Recommendations are yes; these are proposals.

Evidence: lead text replies extracted from the latest two hours of session 6253ecf2; current rulings and queue answers take precedence over older briefs. No product tests rerun by this tracker.

## Prior tracker record (retained)


## Current specification — 2026-10-20, 15:35 PDT

**What:** Move maintainer queue, tracker and review into main-app plugins at P2.

**Why:** PLUGIN-3 requests these features through the same public interface available to everyone.

**Current state:** The four panel designs are now merged into proposed decision 0017 and its visual review page, reported ready at 15:34 PDT. Nothing is approved or built. The proposed first slice is needs-you: existing agent waits answered through run/answer; broader review, curator and tracker migration follow. This supersedes the earlier synthesis-pending state.

**Next step:** After Will reviews 0017, build the approved first slice through the public plugin interface and preserve existing answers and review history.

**Open questions for Will:** 0017 asks about compiled React, sandbox-only repository/personal code, and needs-you as a feature for every person.

Evidence: last two hours of user-typed messages and lead text replies extracted from session `6253ecf2` through 15:34 PDT; queue answers through 14:36 PDT; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Completion receipts are reported evidence; this tracker ran no product tests. Older briefs yield to later rulings.

## Earlier tracker history

## Current specification — 2026-10-20, 15:24 PDT

**What:** Move the maintainer queue, tracker, knowledge links and review into main-app plugins at P2.

**Why:** Will requested all maintainer features through the public interface, alongside release work.

**Current state:** All four panel designs are in and synthesis started at 15:16:33. No implementation or approved merged design is evidenced.

**Next step:** After Will reviews the merged design, prove the queue plugin end to end, preserving answers and review history; migrate the remaining features through the same public interface.

**Open questions for Will:** Review the merged plugin design before building.

Evidence: Will’s typed messages and lead text replies, extracted from session `6253ecf2` for its latest two hours through 15:23:55 PDT; [rulings](../rulings.md), queue answers through 14:36 PDT, shared briefs/designs and current decisions, proposals, TODOs and rules. Receipts above are reported, not fresh product tests run by this tracker.

## Earlier tracker history


## What

Bring the maintainer app’s decision queue, work tracker, knowledge links and review surfaces into the main app as opinionated first-party plugins using the same public interface as external plugins. Start with the decision queue to prove the interface; retain existing review history, answers and revision feedback.

## Why

Will requested all maintainer features in the main app at 14:40, at P2, in parallel where possible (PLUGIN-3). The host should supply primitives and durable flow execution.

## Current state

Requested, with no implementation receipt. The separate maintainer queue and tracker already exist. Panel P is designing the public interface; Sol, Astra and Fable proposals are available, with Opus and the merged review still pending in the available evidence. Proposed package names, routes and the first slice are not approved decisions.

## Next step

After Will reviews the merged design, build the queue plugin through public flow/view contracts, prove persistent answers and keyboard review end to end, then migrate tracker and review. Preserve prior review records; remove replaced implementations as each migration completes. Use the library catalog’s flow, agent, views and UI entries; extend the SDK for missing primitives. Production release work stays ahead of P2.

## Open questions for Will

Review the merged plugin design before implementation (PLUGIN-2). No additional migration micro decisions need his answer now.

## History

2026-10-20 14:40 PDT: Will requested this migration in chat. At 14:42 the lead launched the four-model panel and stated that no implementation begins before Will reviews its merged design.

---
title: Electric client bug report (not filed)
status: done
area: sdk
owner: no outbound report; sync repair builder owns remaining defect
updated: 2026-10-20
links: [../state.md, effect-tanstack-db-and-effect-electric.md, ../../../../packages/effect-electric/electric-client-offset-bug.md, ../rulings.md]
---

## Current specification — 2026-10-20, 15:24 PDT

**What:** Track the Electric defect internally without sending a bug report.

**Why:** PROC-11 prohibits outbound bug and feedback reports.

**Current state:** At 15:20:31 the lead reported a draft, explicitly not filed, alongside the response-validation fix. One rare upstream-dependent case remains open in the sync workstream. A draft does not authorize filing.

**Next step:** Keep the draft internal and track product protection and the remaining case in effect-tanstack-db-and-effect-electric.md.

**Open questions for Will:** None.

Evidence: Will’s typed messages and lead text replies, extracted from session `6253ecf2` for its latest two hours through 15:23:55 PDT; [rulings](../rulings.md), queue answers through 14:36 PDT, shared briefs/designs and current decisions, proposals, TODOs and rules. Receipts above are reported, not fresh product tests run by this tracker.

## Earlier tracker history


## Current specification — 2026-10-20, 15:10 PDT

**What:** Retain Electric defect reproductions and regression evidence without sending a report.

**Why:** PROC-11 explicitly prohibits bug and feedback reports.

**Current state:** No report was filed. The earlier request for permission to file is superseded. Local sync repair remains active in effect-tanstack-db-and-effect-electric.md; that work is independent of upstream reporting.

**Next step:** Keep local fixes, reproductions and version-specific limitations current in the sync workstream. Do not queue an upstream-report question.

**Open questions for Will:** None.

Evidence: recent user text and lead replies from session `6253ecf2`, extracted through 15:10 PDT; [rulings](../rulings.md) and queue answers through 14:36 PDT. Reported completion is distinguished from a test run by this tracker.

## Earlier tracker history


## What

Three defects in `@electric-sql/client` 1.5.28, the latest:
1. It moves a live stream's offset to each subset snapshot's offset. With paging, sync can skip updates, which loses streamed answer text.
2. It never restarts a shape stopped by a response missing Electric's headers, such as a gateway error page. Only a page reload recovers.
3. It takes a response's offset from its headers before it parses the body, so a batch cut short is skipped when the shape restarts, and an empty 200 body is read as `[]` with no error. The branch workspace's builder saw the lost row on 2026-10-20. Draft with a reproduction: [`packages/effect-electric/electric-client-offset-bug.md`](../../../../packages/effect-electric/electric-client-offset-bug.md).

## Why

The client agent found both while building `@smthrs/effect-electric`. We work around the first in that package, and document the second.

## State

- Workaround for (1) ships in the working copy as `keepOffset`: a comment naming 1.5.28, a version-pin test, and a reproduction confirmed to fail without the workaround. Listed in the package changelog.
- (2) is documented in the package. A 2xx page that isn't JSON no longer reaches it: (3)'s workaround stops that shape first, and `reconnect` restarts it.
- Workaround for (3), 2026-10-20, uncommitted: `ElectricCollection.make` reads every 2xx batch of the log in full before Electric sees it; a cut batch stops the shape before Electric takes its offset. Regression and seeded fuzz tests in `test/ElectricCollection.test.ts` fail on the old code (all 20 cut points lost a row). A row that fails the collection's schema still skips its batch on `reconnect`; only an upstream fix closes that.
- None is reported upstream. Filing posts publicly on Electric's GitHub, so it needs Will's yes. Earlier the same day Will said: "Sotp sending bug reports never send bug reports only focus on this".

## Next

Nothing until Will answers. If yes: minimal reproductions against Electric 1.8.1, then delete the workaround when a fixed client ships.

## Questions for Will

- File the issues on Electric's GitHub? Default if unanswered: don't file.

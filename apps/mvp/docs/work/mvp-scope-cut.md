---
title: MVP scope cut (reference only)
status: done
area: process
owner: Will (answered 23:00 on 2026-10-19: "more or less right"; reference only)
updated: 2026-10-19
links: [../proposals/mvp-gaps.md, ../proposals/early-features.md, decisions-for-will.md, design-questions.md, todos-and-stack.md, pr-review-and-merge.md, github-source-of-truth.md, notifications-and-live-work.md, land-and-deploy-mvp.md]
---

## What

The MVP is one loop: ask in chat, TODO, the agent works it on its own branch, PR on GitHub, a person reviews the diff and merges. The gap list proposes three items for it, each trimmed to the loop:
1. [TODOs and the stack](todos-and-stack.md)
2. [Review and merge](pr-review-and-merge.md)
3. [GitHub as the source of truth](github-source-of-truth.md)

[Notifications and live work](notifications-and-live-work.md) moved into their own design at Will's word. The other 13 items are roadmap.

Since 22:56 on 2026-10-19 the lead asks for four items, with notifications back in as items 4 and 6:

```
ask in chat ──▶ TODO ──▶ agent works it on its own branch (sandbox)
            ──▶ PR on GitHub ──▶ a person reviews the diff ──▶ merge
```

| # | MVP item | Kept | Cut until later |
|---|---|---|---|
| 1 | [TODOs](todos-and-stack.md) | create from chat; the agent works it on its own branch; see status; drop it | reordering a stack of TODOs, amending, TODOs from issues |
| 2 | [Review and merge](pr-review-and-merge.md) | see the PR's diff and checks; a Maintainer merges through the merge flow | evidence views, pre-approval, stack-order rules |
| 3 | [GitHub as truth](github-source-of-truth.md) | open the PR on GitHub; show merged or closed | conflict screens, steering from review comments, full issue sync |
| 4+6 | [Live work and notifications](notifications-and-live-work.md) | toasts for your runs, "Needs you", failures that stay (decision 0009) | the `Earlier` list, repository notification rules |

Superseded for checks at 13:21:27 on 2026-10-20 ([no GitHub Actions](no-github-actions.md)): item 2's checks are the Smithers flow runs on the PR's head SHA, never GitHub's check runs or statuses.

Covered elsewhere, outside the four: sign-in, roles, opening a repository, the agent asking you questions mid-task, and pause, resume and retry.

## Why

Will: "I will go through that list and approve what shoudl be approved". Then: "This seems aggressive? ... MVP means minimum right surely this 17 has easy cuts it can make before I even look at it?"

Will, 23:00 on 2026-10-19: "Don't worry about the mvp I gave you a list of things we are building that's what we are building now and it's insufficient for mvp but once we finish everything we got so far I need to test the app review the code we are so far away from mvp right now I need you to focuse and not worry swo much about htemvp. But yes it's more or less right"

## State

- `proposals/mvp-gaps.md` holds the cut; each cut item has a one-line reason (for example, the wiki is a second product surface the loop doesn't need).
- "Truthful import states" (item 13) folded into [repo open states](repo-open-states.md).
- 22:56 on 2026-10-19: all 14 design questions closed ([design questions](design-questions.md)). The lead then asked Will to approve the list above: "Is this the MVP?" It is row 1 of [decisions for Will](decisions-for-will.md). No answer at 22:58.
- 22:59: the lead asked again: "Still open from before: is the MVP list right?"
- 23:00: **Will answered: reference only.** The list is "more or less right", but it is not what gets built now. Work follows his feature list (features 1 to 8 in the lead's `FEATURES.md` brief); when it is finished he tests the app and reviews the code ([land and deploy](land-and-deploy-mvp.md)). `proposals/mvp-gaps.md` now says "This file is reference only".
- 23:02: the lead: "I'll stop raising MVP scope and drive your feature list to an app you can test and code you can review." The four items keep their notes, status `todo`, with nobody building them now. Notifications also stay on the feature list as early feature 8b.

## Next

None. This list is reference for later MVP work, not a build order. Raise MVP scope again only when Will does.

Until 23:00 the next step was: Will approves or rejects each item; the approved ones move to `todo`.

## Questions for Will

- None open.
- Is this the MVP? Items 1, 2, 3 and 4+6 as kept and cut in the table above. Asked 22:56. (Answered 23:00: "more or less right"; reference only, "Don't worry about the mvp".)
- Approve items 1, 2 and 3 as trimmed? (Folded into the 22:56 question; answered 23:00.)

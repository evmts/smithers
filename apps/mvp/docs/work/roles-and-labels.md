---
title: Roles and labels
status: todo
area: design
owner: unassigned (build of `@smthrs/access`); the wiring agent adds the model endpoint's Member gate (since about 01:17 on 2026-10-20); design done: the 0007 rewrite agent finished about 23:06 on 2026-10-19; lead records Will's answers
updated: 2026-10-20
links: [../decisions/0007-roles-and-tags.md, ../decisions/0008-auth.md, design-questions.md, pr-review-and-merge.md, auth.md, decisions-for-will.md, sign-in.md, model-endpoint.md, app-wiring.md, fable-review-2-fixes.md, slash-commands.md, agent-status.md, token-spend-alerts.md]
---

## What

Four repository roles since 22:48 on 2026-10-19, each a plain field a flow can change later:

| Role | Means | Can |
|---|---|---|
| **Admin** | runs the repository in Smithers | everything, plus people, secrets and admin settings (models, budgets) |
| **Maintainer** | trusted to ship | merge and approve, plus everything a Member can |
| **Member** | trusted contributor | branches, sandboxes, run flows, ask Smithers, open PRs; no merging |
| **Guest** | untrusted contributor | issues, comments, PRs from forks; anything that would run code, use a sandbox or touch secrets waits for a Member's or Maintainer's approval |

GitHub permissions map onto them (0007, accepted about 23:06): admin to Admin, maintain to Maintainer, write to Member, and read or triage to Guest. On a public repository a signed-in person with no role counts as a Guest; a signed-out visitor holds no role and reads public repositories.

Merging into main runs the repository's merge flow, which the repository can customize; by default Maintainers and Admins merge (22:49). A person always merges, never an agent or a Guest.

Unchanged from the proposal: every action names its minimum in one catalog. Agents act with their person's role, never above it. The server checks the role inside the write's own transaction. Branches are `locked`, `open` or `restricted`. Labels follow GitHub's model; applying one is an idempotent flow. They're "labels" because "tag" already means a git tag.

Until 22:48 the proposal was GitHub's five repo roles (reader, triager, contributor, maintainer, admin) with GitHub's powers, so an import maps one to one.

## Why

Will: "We need ability to assign roles like maintainer contributor etc. (just like github). We also will want ability to add tags to issues and prs like github too. These will be important later but we need it architected".

Will, 22:46: "Let's do admin, maintainer, trusted contributor, untrusted contributor but maybe name them better than that. Keep it simple in future this will get more advanced including workflows to decide if someone is trusted or untrusted stuff like that". 22:48: "role names are good".

Will, 22:49: "Merging into main is actually triggering a workflow and that workflow is configurable. By default maintainers and up obviously".

## State

- Decision 0007 is proposed, with Will's three questions open. Nothing is built.
- Managing people moves from maintainer to admin, as on GitHub, if the five roles are accepted.
- Decision 0005 corrected it: branch-scoped Code Storage tokens do exist.
- 21:21 on 2026-10-19: the lead asked Will to accept the recommended answers below in one batch ([design questions](design-questions.md)). No answer yet.
- 22:45: asked one at a time as design question 9 of 14: should GitHub's five roles replace M-05's three?
- 22:46 to 22:48: **Q1 answered: four roles, not five.** The lead proposed the names Admin, Maintainer, Member and Guest (Member and Maintainer are already product-spec words); Will accepted them at 22:48. Trust decided by flows, such as promoting a Guest to Member after merged PRs, is out of scope now. Recorded in 0007 under Q1.
- 22:49: **Q2 answered: merging is a configurable flow.** By default Maintainers and Admins merge; every customization keeps the root `AGENTS.md` boundary (a person merges, never an agent, never a Guest). Recorded in 0007 under Q2 ([PR review and merge](pr-review-and-merge.md)).
- 22:49: **Q3 asked** (question 11 of 14): may event-started flows, such as triage on a new issue, apply ordinary labels as Smithers, with guarded labels like `todo` and `approved` reserved for people? No answer at 22:53.
- 22:56: **Q3 deferred.** Will: "question 11 I think is thinking too far ahead whatever asked the question is doing too much we haven't gottent hat far yet." Recorded in 0007 under Q3: no event-started labeling flow exists yet, so decide it when the first one is built. **All three of 0007's questions are settled**; its file status still reads "proposed".
- 22:56: the lead's MVP list keeps roles as "covered elsewhere", outside the four MVP items, and keeps "a Maintainer merges through the merge flow" in item 2 ([MVP scope cut](mvp-scope-cut.md)).
- 0007's body still describes five roles: the role ladder, the action catalog's minimums, the `role_grants.role` check constraint (`reader`, `triager`, `contributor`, `maintainer`, `admin`), the GitHub import mapping and the M-05 change note. Only its Questions section has the four roles.
- 23:00: **the lead started an agent to rewrite 0007 for four roles.** Its brief:
  - rewrite the decision, the role table, the schema and `@smthrs/access` sketches, the GitHub mapping and the permission checks;
  - map GitHub permissions onto the four roles, checked against the record's own reasoning; the brief's example is admin to Admin, maintain to Maintainer, write to Member, and read or no access to Guest;
  - a role is a plain field a future flow may change, such as promoting a Guest; that flow is out of scope;
  - merging is the repository's configurable merge flow, Maintainers and Admins by default, never an agent or a Guest;
  - remove or mark deferred any detail that exists only for Q3; keep the rest minimal ("Keep it simple");
  - set the status line to accepted (Will, 2026-10-19), keep Sources and the answered questions;
  - then fix other docs that name five roles or "triager", leaving this tracker alone; `pnpm docs:check` at the end.
- 23:07: 0007 last changed at 22:56; its status line still reads "proposed" and its body still has five roles.
- About 23:06: **0007 is rewritten and accepted** ("Status: accepted (Will, 2026-10-19)"). The lead reported it at 23:12.
  - Four roles throughout: Admin, Maintainer, Member and Guest. GitHub admin maps to Admin, maintain to Maintainer, write to Member, and read or triage to Guest.
  - Deferred: event-started labeling (Q3) and the flow that decides trust, such as promoting a Guest (Q1).
  - Cut: the triager role, guarded labels and path rules.
  - The rewrite agent aligned the role wording in 0004, 0005 and 0009.
- 23:15: two follow-ups from 0007's Consequences still use the old roles. `.specs/product/mvp.md` M-05 still reads "Three roles: Owner, Maintainer and Member", and §6.15 matches it; `MemberRoleSchema` in `@smthrs/rpc` has the old roles too. Nothing is built. **Design done; moved to todo.**

- 23:15 to 23:25: the four roles reach code, uncommitted: `worker/Actor.ts` types `Role` as `admin`, `maintainer`, `member` or `guest`, and its tests refuse `admin/SetModel` for a member (`not_admin`) and for an agent acting for an admin (`delegated`) ([model endpoint](model-endpoint.md)). The `@smthrs/access` package isn't started.

- 23:39: the [model endpoint](model-endpoint.md) shipped with Admin-only `admin/SetModel`; `worker/DevChatApi.ts` provides a local Admin in dev only.
- 23:39: S1 started [sign-in](sign-in.md) phase 1, which maps people onto the four roles: the identity 0007's phase 2 needs. 0007's phase 1, `@smthrs/access`, is still unassigned.
- About 01:00 on 2026-10-20: **S1 is done** ([sign-in](sign-in.md)). A session's role comes from the person's GitHub permission, mapped onto the four roles, and the durable flow `auth/RecheckRole` checks it again every hour. One gap is on the lead's checklist: the [model endpoint](model-endpoint.md) must require Member or above, since a Guest can ask today ([app wiring](app-wiring.md)). 0007's phase 1, `@smthrs/access`, is still unassigned.

- About 01:17 on 2026-10-20: the wiring agent adds the Member gate to the [model endpoint](model-endpoint.md): only a Member or above may spend model tokens, per 0007 ([app wiring](app-wiring.md)).
- 01:27, on disk: `worker/Actor.ts` defines `ASKERS` as Admin, Maintainer and Member, "the roles that may ask Smithers (`repo:ask`, decision 0007 §2)", with `Actor.test.ts`. The check lives in the app's worker, not in `@smthrs/access`, which is still unassigned.
- **06:41:17 on 2026-10-20: 0007 Q3 is back in scope for triage.** Will: "we need the ability to customize issue triage so issues should have accepted or not accepted and workflow can accept them or reject via an agent". He had deferred Q3 (event-started flows applying labels with no person) at 22:56 on 2026-10-19. Panel G designs triage labels in 0012: a Maintainer enables the flow, a system step applies one triage label attributed to the flow and its enabler, and Members override ([issue triage](issue-triage.md)). Opus proposes new actions `repo:triage` (Member) and `repo:triage-flow` (Maintainer).
- 06:40:35 on 2026-10-20: Will asked for branch sharing with read and write grants. Panel B's Sol design makes a grant narrow, never widen, a person's repository role and GitHub permission ([branch sharing](branch-sharing.md)).
- By 07:20 on 2026-10-20, role checks other items shipped, uncommitted: cloning needs Member or above (`canClone`, Fable review 2's P3-3); only the asker writes an answer, so another Member or an Admin who didn't ask gets 403 (P2-1) ([Fable review 2 fixes](fable-review-2-fixes.md)); each slash command has a `minimum`: `/theme` and `/navigate` for anyone, `/web` and `/clone` for Members and up ([slash commands](slash-commands.md)); only a run's launcher writes or answers its `runs` row ([agent status](agent-status.md)).
- 13:19:52 on 2026-10-20: the lead's list: "Roles and labels; token-spend alerts: not started". At 13:22 the lead started [token-spend alerts](token-spend-alerts.md) but not this; its 13:21:12 answer named neither a reason to wait nor this item. Best guess: 0007 §11 phase 1 (`@smthrs/capability` actions, the `@smthrs/access` package) needs no app files and could start next.

## Next

1. Change `mvp.md` M-05 and §6.15, and `MemberRoleSchema` in `@smthrs/rpc`, to the four roles, as 0007's Consequences say.
2. Build 0007 §11 phase 1: the `repo:*` actions in `@smthrs/capability` and the pure `@smthrs/access` package with its property tests. It needs nothing. Phase 2 needs 0008's `CurrentActor` ([sign-in](sign-in.md)).

Until 23:06 the next steps were:

1. Will's answer to Q3; then 0007 can be accepted. (Q3 deferred 22:56; all three settled.)
2. **Revise 0007 from five roles to four** (in progress since 23:00; done about 23:06) (Admin, Maintainer, Member, Guest): the ladder, the catalog minimums, the schema's role check, the event-started actor's ceiling (it names triager), the GitHub import mapping, and the merge rule as the repository's merge flow.
3. Build after [auth](auth.md) is settled: the `@smthrs/access` package and the per-repository shape check.

This item moves to todo once 0007 describes four roles throughout. (Done about 23:06; moved to todo at 23:15.)

## Questions for Will

- None open.
- May an event-started flow, such as issue triage, apply ordinary labels as Smithers, with guarded labels like `todo` reserved for people? Recommended: yes, within the limit an admin sets when enabling the flow; never a guarded label, a merge or an approval. Asked 22:49 as question 11 of 14. (Deferred 22:56: "thinking too far ahead"; decide when the first event-started labeling flow is built.)
- Replace the spec's three roles (M-05) with GitHub's five? Recommended: yes. (Answered 22:48: four roles, Admin, Maintainer, Member and Guest.)
- Merging into main is maintainer-only by default? Recommended: yes. (Answered 22:49: merging runs the repository's configurable merge flow; by default Maintainers and Admins.)

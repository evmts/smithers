---
title: Agent-run credentials and server-enforced person-only actions
status: in-progress
area: app
owner: slice 0 credential builder, started by lead at 17:56 PDT
updated: 2026-10-20
links: [auth.md, todos-and-stack.md, pr-review-and-merge.md, ../rulings.md]
---

## Current specification — 2026-10-20, 18:04 PDT

**What:** Issue server-enforced run credentials and derive person-only actions from the flow registry.

**Why:** The server must distinguish a person’s own press from an agent or plugin invocation.

**Current state:** At 17:56:53 PDT the lead started slice 0 after the final 0017 design edits. Implementation is underway; no passing boundary-test receipt exists.

**Next step:** Prove agents cannot commit TODOs, share branches, open terminals, answer, approve or merge; prove a person’s press works and replayed, expired and foreign-run credentials fail. Narrow nested authority and retain one generated action list.

**Open questions for Will:** None.

Evidence: lead text replies extracted by script from the latest two transcript hours through 2026-10-21 01:03:57 UTC; queue rulings through 00:42:06 UTC; current rulings and decision 0017 override historical panel proposals. Product checks and landing receipts are reported evidence; this tracker runs the maintainer-site build only.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 17:44 PDT

**What:** Give every agent and plugin run a server-issued credential with narrowed authority.

**Why:** The server currently cannot reliably distinguish agent calls from the signed-in person.

**Current state:** Slice 0 is the next build after final 0017 edits. At 17:40 the lead required one source for credential-bearing runs and person-only actions, including branch sharing and terminal opening. No implementation receipt.

**Next step:** Implement the common authority list and server refusals, nested permission narrowing and adversarial tests before plugin production use.

**Open questions for Will:** None for this update.

Evidence: queue answers through 2026-10-21 00:42:06 UTC and script-filtered human text/lead replies from 22:43–00:43 UTC; current rulings and decision 0017 supersede historical briefs. Product checks are reported evidence; this tracker validates the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:24 PDT

**What:** Give agent, flow and app invocations a scoped run credential enforced on person-only server actions.

**Why:** An agent must never acquire approval, merge, grant or Commit authority from a person’s session.

**Current state:** Decision 0017 now defines this as core slice 0: server-minted invocation context and Actor.act, no cookie fallback, host-issued confirmation receipts and server refusal tests. It may start independently of plugin work and must land before needs-you ships to production. Implementation and passing boundary tests remain unreported.

**Next step:** Assign and implement slice 0 through existing auth and durable-flow services. Prove nested calls cannot widen authority and agent credentials cannot answer a person’s wait, commit, approve, merge or grant secrets. Keep known security holes switched off.

**Open questions for Will:** None.

Evidence: script-extracted user-typed text and lead replies from session 6253ecf2, latest two hours through 2026-10-21 00:23:43 UTC; queue answers through 00:06:34 UTC; current rulings and decision 0017, including its Astra fixes. Older briefs and proposals yield to these rulings. Completion and tests are reported evidence; this tracker validates the site build only.

## Earlier tracker history (retained)


## What

Give every agent run its own credential and check that authority on every person-only server action.

## Why

People approve and merge; an agent must never acquire those powers by using a person’s session.

## Current state

At 15:59:51 PDT the lead identified a trust gap: browser-agent requests carry the person’s sign-in. Device flow allowlists currently prevent Commit, approval and merge; the server cannot distinguish that agent from the person. The lead prioritizes the gap for the next review. No implementation or proof of enforcement is reported.

## Next step

Assign the fix; design scoped run identity and revocation through existing auth/flow services, reject agent credentials on person-only routes and add real boundary tests for bypass attempts. Keep features with known security holes switched off (trust ruling).

## Open questions for Will

None; human-only authority is already a ruling.

## History

2026-10-20 16:04 PDT: added from the lead’s text replies in the last two hours of session 6253ecf2, extracted by script; current rulings take precedence. No operational action or product test was run by this tracker.

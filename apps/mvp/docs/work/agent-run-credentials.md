---
title: Agent-run credentials and server-enforced person-only actions
status: done
area: app
owner: slice 0 credential builder, started by lead at 17:56 PDT
updated: 2026-10-21 00:53 PDT
links: [device-ownership-and-queued-authority.md, auth.md, todos-and-stack.md, pr-review-and-merge.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 00:53 PDT

**What:** Enforce run-bound credentials and server-side person-only actions.

**Why:** An agent must never answer or approve as the person.

**Current state:** The 00:25 lead update and builder’s retained 00:30 record establish the credential half works end to end: agent credentials are refused for the person’s answer and the person’s press succeeds. Dev-reload forgery, parentless child-run and sandbox-answer refusals were fixed; Needs you questions return. The earlier top-of-note suspicion is superseded. Confirmation receipts remain a separate unfinished slice.

**Next step:** Land the proven credential files in the combined round and verify production after deployment. Track legacy ownership/queued authority remediation separately; finish confirmation dialogs as follow-up.

**Open questions for Will:** None.

Evidence: script-filtered user-typed messages and lead text replies, session 6253ecf2, 22:53–00:53 PDT; rulings and queue answers through 00:17:42 PDT; shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Automated notifications and tool blocks excluded. Product receipts are lead-reported; this tracker validates the site build only. Execution ownership and prior history retained.

## Earlier tracker history (retained)

## Tracker reconciliation — 2026-10-20, 22:35 PDT

**What:** Enforce server-minted, run-bound authority and refuse delegated credentials for person-only actions.

**Why:** Agent requests must never impersonate a person.

**Current state:** At 22:29 the lead reports handoff to the lander and 15 affected server suites passing; e2e waits for the test pause. Missing Needs you questions and 403 run refusals are suspected regressions to check before landing. The builder’s 22:30 record below retains unbuilt confirmation receipts and documentation-sync follow-ups.

**Next step:** Check both regressions against this change, then obtain run-credential e2e and full coverage receipts before claiming the slice works.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead text replies from session 6253ecf2, approximately 20:35–22:35 PDT; automated notifications and tool blocks excluded. Current rulings and queue answers (latest 19:38 PDT) prevail over historical briefs and proposals. Execution ownership retained; Codex tracker curator reconciles documentation only. Product receipts are lead-reported; tracker verification is the maintainer-site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-21, 00:30 PDT

**What:** Run credentials (decision 0017 slice 0) are built: server-minted, run-bound bearer tokens whose `act` the server sets from the registry's `acts` mark; one person-only list derived from the registry (`worker/Actor.ts`); authority narrowed at each nested call (`Flow.intersectCeilings`, `Flow.ceilingWithin` in `@smthrs/flow`); the engine sends every non-person run's requests with its credential and no cookie; the git writes route reads `via` from the request, never the body. Docs: [sign-in.md](../features/sign-in.md#run-credentials).

**Current state:** Done for the credential half of slice 0. `e2e/run-credentials.spec.ts` passes on the mini (GIF `~/Desktop/smithers-mvp/gifs/run-credentials-…gif`); the worker, engine and flow suites pass; `pnpm docs:sync` and `docs:check` pass. Fixed during the burn-down: a credential no longer reads as forged after the dev server reloads (dev credentials sign with `SESSION_SECRET`), the engine asks again once when a credential comes back `401`, and a run with no recorded parent nests in the run it is named after (`requesterOf`), so the agent's question reports for its answer.

**Follow-ups (status: todo):**
- Confirmation receipts and the host's confirm dialog for protected acts (0017 slice 0's second half).
- A remote host minting its own runs' credentials; a plugin installation as a credential's subject (slice 2).

**Open questions for Will:** None.

## Earlier specification — 2026-10-20, 18:04 PDT

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

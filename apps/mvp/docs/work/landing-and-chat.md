---
title: Landing page and chat with Smithers
status: done
area: app
owner: lead (smithers-b3)
updated: 2026-10-20
links: [../features/chat.md, ../state.md, ../../AGENTS.md]
---

## Current specification — 2026-10-20, 16:44 PDT

**What:** Open the landing page and chat through the browser durable agent and server model proxy.

**Why:** The first feature needs passing real-browser evidence.

**Current state:** At 16:35 the lead reported passing start-page recordings back in the queue. At 16:41 the earlier two failures were attributed to the mini’s first cold setup run; the MacBook recordings pass. This supersedes the unresolved-cause summary retained below.

**Next step:** Will reviews the passing walkthroughs; retain the setup failure evidence in the test-farm workstream.

**Open questions for Will:** None.

Evidence: user-typed text and lead text replies extracted by script for 21:43–23:43 UTC from session 6253ecf2; rulings and queue answers override older briefs. Product receipts above are reported by the lead; this tracker ran only the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 16:35 PDT

**What:** Open the landing page and chat through the browser durable agent and server model proxy.

**Why:** This is the first app feature and must pass real browser tests.

**Current state:** At 16:29 the lead reported failed start-app/landing and start-app/sync-down-at-boot recordings, held from the queue. Their origin may be the mini’s first trial; setup versus product cause is unresolved. Earlier completion is retained below, but fresh failures reopen verification. The old direct-model description below is historical and superseded by DUR-4 and ARCH-5/6.

**Next step:** Reproduce in the known-good dev stack and mini, fix the cause and retain passing replacement recordings.

**Open questions for Will:** None; agents can resolve the failure cause.

Evidence: lead text replies extracted by script from the session’s latest two hours through 23:34:16 UTC; current rulings and queue answers take precedence over older designs. Reported product-test receipts only; this tracker ran no product tests.

## Prior tracker record (retained)


## What

The from-scratch app `apps/mvp`: the Oct 16 landing with the animated SMITHERS wordmark, then `/app`, where ⌘K opens a chat with Smithers. ⌘K, Esc and a Hide button close it. The model is `qwen-3.8-27b` at `low` reasoning on Cerebras, chosen by config (`CHAT_MODEL`), through an OpenAI-compatible route.

## Why

Will: "Ok so the first feature we should add is Smithers. This means simply adding the chat and the ability to talk to smithers." On the landing: "use the one from before like a few days ago". On the model: "yea qwen low please".

## State

- Commits `wuqqxzon` (landing), `wozsxvws` (`Wordmark` in `@smthrs/ui`), `pquowwrt` (one composer box) and `runquuvm` (chat). Local only.
- The ⌘K twice bug Will found has a regression test.
- Qwen at `low` answered in about 0.4 s in a direct test; `gpt-oss-120b` is 3 to 5 times faster but scores far lower.

## Next

The agent replaces the direct model call: [flows and the agent](flows-and-agent.md).

## Questions for Will

None.

---
title: Landing page and chat with Smithers
status: done
area: app
owner: lead (smithers-b3)
updated: 2026-10-19
links: [../features/chat.md, ../state.md, ../../AGENTS.md]
---

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

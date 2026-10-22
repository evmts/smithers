---
title: Preserve generated item conversation attributes
status: done
area: ui
owner: codex-fix-item-conversation-954383
updated: 2026-10-21
links: []
---

Reproduce host props overriding the generated accessibility and data attributes in ItemConversation and ItemAsideSection, then fix prop precedence. Uses the library catalog entry for listing issues and showing one: @smthrs/ui.

Validation on Latitude with LAT_RUN_REUSE_DEPS=1:
- Before fix: `bun test tests/item-conversation.test.tsx` — 23 passed, the 3 new regressions failed because host attributes replaced generated ones.
- After fix: `bun test tests` — 2,578 passed, 0 failed across 179 files.
- `pnpm exec smithers-build test //packages/smithers/ui:importRules` — passed.
- In apps/mvp, `pnpm exec tsc --noEmit` — passed.

The fix spreads host props before generated attributes in both article branches and the aside section. No new action or telemetry boundary, dependency, or persisted schema is introduced.

---
"@smthrs/ui": minor
---

Adds notices for apps/mvp decision 0009 §4:

- `NoticeState` is the agent's five states plus `update`, an event such as a repository's main moving.
  `NOTICE_WORDS` and `NOTICE_GLYPHS` add `● Updated` to the agent's words and glyphs.
- `noticeDismissDelay(state)` is 4000 ms for `done` and `update`, and `Infinity` for the rest.
  `workNoticeVisible(notice, nowMs)` says whether a notice's toast shows: open, not hidden, and before
  `updatedAtMs + noticeDismissDelay(state)`. Both are pure and on the root.
- `Toast` takes `tone="update"` (muted border and glyph), `word` (bold, in place of the state's word), `unread`
  (`data-unread`, a brand dot and `Unread` for screen readers) and `hideLabel` (the × button's name, default `Hide`).
- `ToastStack` takes `more`, the person's other entries, shown after the toasts only while expanded. `+N` counts the
  toasts past `max` plus the `more` entries and shows even with no toasts. It toggles: `Less` (`aria-expanded="true"`)
  collapses the stack again. The stack renders nothing with no toasts and no `more` entries.
- A floating `ToastStack` takes the pointer only on its toasts and its `+N` button, so the page under its empty room
  stays clickable.

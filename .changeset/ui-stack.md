---
"@smthrs/ui": minor
---

Adds the stack's components for apps/mvp decision 0016 §4:

- `StackList`: a repository's TODOs as an `ol` named `Stack`, in the host's order. Each row shows `T4`, or `T–` before
  the stack numbers it, the title (a link with `href`; a plain click calls `onNavigate`), the state chip, a `Requested`
  or `Not sent` chip, and Drop. Rows carry `data-todo`, `data-state` and `data-pending`, and the `selected` row
  `aria-current="true"`. ArrowDown, ArrowUp, Home and End move focus between rows. `loading` shows placeholders and a
  status; an empty stack shows `No TODOs`.
- Drop shows on numbered TODOs that aren't merged, dropped or pending, and confirms inline once: `Drop T4` and
  `Cancel`. `Cancel` and Escape put Drop back.
- `TodoCard`: one TODO at full size, with its prompt as Markdown (no HTML), its acceptance criteria and Drop.
- `TodoDraftCard`: a private draft named `TODO draft`, with `Draft` and `Only you`, a `Title` input, a `Prompt`
  textarea, `Commit` and `Discard`. Commit, Enter in the title, and ⌘Enter or Ctrl+Enter in the prompt call
  `onCommit` only with a trimmed title and prompt, a title within `maxTitleLength`, and no commit on its way.
  `refused` shows a chip, such as `Stack full`.
- `TodoState`, `TodoPending`, `TODO_STATE_WORDS`, `TODO_PENDING_WORDS` and `todoNumberText` on the root.
- `stackCss`, part of `smithersUiCss`.

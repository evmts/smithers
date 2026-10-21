---
"@smthrs/ui": minor
---

Adds `TodoDraftCard` for apps/mvp decision 0016 §3: a private draft named `TODO draft`, with `Draft`, `Only you`, a
`source` chip such as its issue `#12`, a `Title` input, a `Prompt` textarea, `Commit` and `Discard`. Commit, Enter in
the title, and ⌘Enter or Ctrl+Enter in the prompt call `onCommit` only with a trimmed title and prompt, a title within
`maxTitleLength`, and no commit on its way. `refused` shows a chip, such as `Stack full`. `todoDraftCardCss` is part of
`smithersUiCss`. A stack draws with `IssuesView` and one TODO with `ItemConversation`.

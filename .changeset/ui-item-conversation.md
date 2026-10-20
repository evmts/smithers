---
"@smthrs/ui": minor
---

Adds the issue views of apps/mvp decision 0012:

- `IssuesView` takes `href` (each title becomes a link), `onNavigate` (a plain click navigates in the host's router; a
  modified click stays the browser's), `loading` (a `Loading issues` status and placeholders, never `No issues`) and
  header `actions`. An issue's `number` may be `null` (shown `#–`), `id` keys its row, and `pending` shows a
  `Requested` or `Not sent` chip. Existing callers are unchanged.
- `ItemConversation`: one issue's page. The title with `#number`, an `Open` or `Closed` badge, the author, an optional
  `Open on GitHub ↗` link, the body and comments as Markdown in document mode (no HTML becomes markup), a pending
  chip, reason and actions per comment, and an optional controlled composer that submits on `Comment`, ⌘Enter or
  Ctrl+Enter.
- `IssueForm`: the controlled new-issue form, with a `Title` input, a `Description` textarea, an alert for `error`,
  and a submit that ⌘Enter or Ctrl+Enter also triggers.
- `itemConversationCss`, part of `smithersUiCss`.

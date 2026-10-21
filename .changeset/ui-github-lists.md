---
"@smthrs/ui": minor
---

Lists and item pages as GitHub draws them, for issues, pull requests and TODOs alike:

- `ItemStateIcon` and `ItemStatus`: a 16-pixel state icon named by its word, for `open`, `closed`, `requested`,
  `queued`, `running`, `needs_you`, `in_review`, `merged`, `dropped` and `failed`; `ITEM_STATE_VARIANTS` colors it.
- `IssuesView` rows lead with their state icon (`status`, default Open or Closed), carry `data-status`, show the time
  relative to now, end their meta line with `links`, and take a `⋯` `menu`. `filter` adds Open and Closed tabs with
  counts and shows only that state's rows; `numberPrefix`, `emptyTitle`, `ordered` and `unknown` (no counts and no empty
  state while rows aren't known, with no loading state). ArrowDown, ArrowUp, Home and End move between rows' links.
- `ItemConversation` takes `status` (its pill's icon and word), `numberPrefix`, timeline `events`, and an `aside` side
  column of `ItemAsideSection`s, with their `links`, and actions.
- `ActionMenu`: a quiet `⋯` menu of actions, and `ConfirmButton`, a button that asks first; an action with `confirm`
  asks in a dialog with Cancel focused. `actionMenuCss` is part of `smithersUiCss`.

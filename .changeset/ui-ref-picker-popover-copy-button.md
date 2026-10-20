---
"@smthrs/ui": minor
---

Adds three components for browsing a repository:

- `Popover`, `PopoverTrigger` and `PopoverContent`: a Radix Popover on the overlay tokens, in a portal, aligned to the
  trigger's start.
- `RefPicker`: a branch and tag picker for a repository view's revision. It filters the branches and tags, counts each
  on its tab, shows each commit's short SHA, offers a full SHA typed in the filter, and makes every choice a real link;
  `onSelect` takes a plain click or Enter.
- `CopyButton`: a button that copies through the host's `onCopy` and shows "Copied" once it resolves, or marks
  `data-copy-failed` when it rejects. It never touches the clipboard itself.

`Snippet` takes `copyLabel`, its copy button's accessible name (default "Copy code").

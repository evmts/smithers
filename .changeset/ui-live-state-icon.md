---
"@smthrs/ui": minor
---

Live work on an item: `ItemStatus` takes `live`, and `ItemStateIcon` a `live` prop. A live icon carries `data-live` and
blinks slowly, one calm 2-second cycle, and holds steady under `prefers-reduced-motion: reduce`. `IssuesView` marks a
live row `data-live` and blinks its icon; `ItemConversation` blinks its state pill's icon. A status without `live` is
drawn as before.

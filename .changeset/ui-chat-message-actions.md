---
"@smthrs/ui": minor
---

`ChatMessage` takes `actions`: the message's time and controls, such as Copy, rendered after `meta` in the meta row.
They are hidden (opacity 0, space kept, still in the tab order) until the pointer is over the message on a pointer
that hovers, or focus is inside it. A message with actions is focusable but never a tab stop (`tabindex="-1"`), so on
a touch screen a tap shows its actions and tapping another message moves them there. The fade is 120 ms, and instant
under reduced motion. `meta` stays always shown, for delivery state such as `Queued` or Retry.

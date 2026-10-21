---
"@smthrs/ui": minor
---

Adds the notifications panel and the keys notices answer to, for apps/mvp decision 0009:

- `NotificationPanel` is the person's notifications at the window's top-right, a non-modal dialog whose list scrolls.
  It is controlled (`open`, `onOpenChange`); Alt+N toggles it from anywhere; opening focuses `focus`'s entry or the
  first; arrows, J and K, Home and End move between entries; Escape, × or a pointer down outside it close it and give
  focus back. A pointer down on `[data-notifications-trigger]` isn't outside.
- `NotificationEntry` is one notification: a row button that expands it in place, showing its whole detail, `meta`,
  the last `steps`, a `note`, any `children`, `actions` and Open. The focused row takes O, E, A, H and R.
- `NotificationBell` opens the panel and shows the unread count (`99+` past 99), and, with `needsYou`, `◆ Needs you`
  in gold, so it can replace a separate needs-you pill in a top bar.
- `Toast` takes `onOpen` (its words become one button that opens what it is about), `onExpand`, `onAnswer` and
  `onRead`; a focused toast takes O, E, A, H and R.
- `ToastStack` takes `onMore` and `moreCount`: `+N` counts the toasts past `max` plus `moreCount` and calls `onMore`
  instead of expanding in place. Alt+T focuses its first toast; arrows move between toasts; Escape gives focus back.
- `NeedsYouCard` takes `compact`: only the controls, where the question shows already.
- `NOTICE_KEYS`, `noticeKeyAction`, `isNoticeHotkey` and `isTypingTarget` name and read those keys.

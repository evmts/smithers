---
"@smthrs/notifications": minor
---

Adds `Inbox`, the pure per-person notice rules for apps/mvp decision 0009, on the root and at
`@smthrs/notifications/Inbox`:

- `route(fact)` lists who hears about a run: the launcher first with the run's own state, even when muted, then every
  watcher that is not muted and may read the run, once each. A watcher reads `needs_you` as `waiting`, and an
  `attention` watcher's delivery is `quiet`.
- `audience(watchers, mayRead?)` lists who hears about a subject's event, such as `main` moving or a new release.
- `raises(before, after)` says when a notice's version goes up: a new notice, or a change into `needs_you`, `failed` or
  `done`.
- `ack(notice, act, version)` records Read, Dismiss or Hide with Postgres' `greatest()` merge, capped at the notice's
  version, so acks from two devices agree in either order. `isOpen`, `isUnread` and `isHidden` read the result.
- Schemas `Level`, `RunState` and `Act`, the constant `DEFAULT_LEVEL` (`attention`), and the types `Watcher`,
  `Delivery`, `RunFact` and `Versions`.

---
"@smthrs/platform-browser": minor
---

A tab channel's subscriber holds a bounded backlog, and one that falls behind
fails with a typed error instead of growing without limit.

- `TabChannel.make(construct, { capacity })` holds at most `capacity` untaken
  messages per subscription, `TabChannel.defaultCapacity` (10,000) by default.
  `Port.subscribe` now returns a `Queue.Dequeue<unknown, TabChannelOverflow>`:
  read it with `Queue.take` or `Stream.fromQueue` instead of `PubSub.take` or
  `Stream.fromSubscription`.
- A subscriber that falls that far behind fails, after the messages it holds,
  with `TabChannel.TabChannelOverflow`; the channel logs
  `browser.tab_channel.overflow` and counts `TabChannel.overflows` by channel.
  Other subscribers are unaffected.
- A leader that falls behind stops leading (`browser.runtime.lost` with
  `reason: "overflow"`) and leads again. A tab's `SharedSqlite` fails every
  statement with a `ConnectionError` naming `TabChannelOverflow`, and its
  `BrowserEngine` becomes unavailable with the new reason `channel-overflow`.

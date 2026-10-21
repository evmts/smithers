---
"@smthrs/flow": minor
---

Adds `Action.once`, which makes a write to another service once per dispatch and finds it again by a key the engine
derives, never by what the written object looks like.

- `Action.effectKey(name)` is 64 lowercase hex of SHA-256 over the execution id, `Action.CurrentInvocationKey` and
  `name`. Every run of one dispatch derives the same key; another dispatch, execution or name derives another. It dies
  with `Action.EffectKeyUnavailable` outside a dispatch.
- `Action.once(name, Action.keyed({ find, perform }))` calls `find(key)` and adopts what it answers, calls
  `perform(key)` only when `find` answers none, and calls `find` again when `perform` fails, so a write whose answer
  was lost is adopted rather than repeated. A failing first `find` fails without writing.
- Each write runs in an `Action.once` span with `smithers.effect.name` and `smithers.effect.outcome`, and counts in
  `flows_effects` by outcome. The key is never logged.

```ts
const notify = Notify.toLayer(({ text }) =>
  Action.once("notify", Action.keyed({
    find: (key) => Effect.sync(() => Option.fromUndefinedOr(outbox.get(key))),
    perform: (key) => Effect.sync(() => (outbox.set(key, text), text))
  }))
)
```

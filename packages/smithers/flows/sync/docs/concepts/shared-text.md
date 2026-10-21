---
title: "Shared text"
description: "A text several people edit at once: one Yjs document wrapped in Effect, whose updates merge in any order, whose anchors carry a caret through everyone's edits, and whose seed gives every replica the same first content."
---

`SharedText` is a text several people edit at once, such as a shared prompt or
a file. Each person's page holds a replica. An edit on one replica becomes an
update, and every other replica applies it. Updates merge without loss in any
order, and an update applied twice changes nothing, so a transport may deliver
them late, out of order or again. The module wraps one Yjs document holding
one text; no caller imports Yjs.

```ts
import { SharedText } from "@smthrs/sync"
import { Effect } from "effect"

const program = Effect.scoped(Effect.gen(function*() {
  const ada = yield* SharedText.make
  const bob = yield* SharedText.make
  const update = yield* ada.replace("hello", { caret: 5 })
  yield* bob.apply(update!)
  return yield* bob.text // "hello"
}))
```

## Edits

- `edit(changes)` makes several changes in one transaction, each in the
  positions of the text before any of them, and answers the update to send, or
  `undefined` when nothing changed.
- `replace(next, { caret, base })` makes the text `next` with one change. An
  input that reports only its whole new value uses it. `caret`, the cursor's
  place in `next`, places an insertion that could go in more than one place,
  such as a letter typed beside the same letter. `base` is the text the edit
  was made on, when it may be older than the replica's: an input that still
  showed the text before another person's update arrived. The edit is then the
  change from `base` to `next`, moved past that update, so it never undoes it.
- `changeOf(before, after, caret?)` is that one change, as a pure function.

Positions are UTF-16 code units, as JavaScript strings, a `<textarea>` and
CodeMirror count them. A change never splits a surrogate pair.

## Cursors

`anchor(index)` answers bytes that name a place in the text by the characters
around it. `resolve(anchor)` on any replica answers where that place is now,
after everyone's edits, or `undefined` before the replica has received the text
it points into. A page sends its caret's anchors to the others, for example as
a presence room's state, and each draws it where it resolves.

## Marks

`mark(name, value)` sets a small named string beside the text and answers the
update to send, or `undefined` when the mark already holds `value`. `marks` is
every mark the replica holds. Marks travel in the same updates as the text and
never change it. Of two replicas that set one mark without having seen each
other's, every replica keeps the same one; a mark set after seeing another
replaces it. A shared file's Save, for example, marks the digest of what it
wrote, so every editor can say whether its text is what was saved.

## The first content

A file's text starts from the file. `seed(text)` writes it as one fixed
replica, `seedClient`, so the same text always gives the same bytes: two
replicas that seed a document at once with the same text agree, and a seed
applied twice gives the text once. A server should still keep one seed per
document and have every replica apply the seed it kept.

## On a server

`validate(update, { seed })` checks bytes before a server stores them: they
decode as an update, and only a seed writes as `seedClient`, so nobody can
forge a document's first content. `merge(updates)` turns several updates into
one, as applying each would, and `snapshot` is everything a replica holds.

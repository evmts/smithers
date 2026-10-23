---
"@smthrs/integrations": minor
---

Adds `GitHub.Once.merge`, a pull request merge a durable step makes once through `Action.once` and finds again by its
key. It merges at the head the person saw with `Smithers-Write: <key>` at the end of the commit message, and finds the
merge as the pull request's merge commit carrying that trailer, so a merge someone else made at the same head is never
taken for the step's own. A rebase writes no message to carry the key, so a rebase merge is never found: a lost
answer reads as a pull request someone merged, never as the step's own.

```ts
const merged = yield* Action.once("merge", GitHub.Once.merge(owner, repo, number, { sha, method }))
```

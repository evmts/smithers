---
"@smthrs/integrations": minor
---

Adds `GitHub.Once`, GitHub writes a durable step makes once through `Action.once` and finds again by its key, and
makes the write-marker finders fail rather than answer none when they run out of pages.

- `GitHub.Once.branch`, `commitOnBranch`, `pull`, `issue`, `comment` and `review` are `Action.Keyed` values. Each puts
  the step's key on the object in the request that creates it (a branch-name suffix, a `Smithers-Write` commit trailer,
  the body's write marker) and finds the object by that key alone. `commitOnBranch` fails `status: 409, stale: true`
  when someone else moved the branch, instead of adopting a commit that only looks like the step's.
- `GitHub.Refs.listBranches(owner, repo, prefix)` lists the branches under a prefix.
- `findIssueByWrite`, `findCommentByWrite`, `findPullByHead` and `findReviewByWrite` fail `poll-failed` with
  `incomplete: true` when their page budget runs out without a match; before, they answered none and the caller wrote a
  second time. `findCommentByWrite`'s `since` is optional.

```ts
const sha = yield* Action.once("commit", GitHub.Once.commitOnBranch(owner, repo, change))
```

---
"@smthrs/integrations": minor
---

Adds `GitHub.Pulls`, `GitHub.Refs` and `GitHub.Commits`: read, list, open,
close, merge and review pull requests; read and create branches; append one
commit to a branch with GraphQL `createCommitOnBranch`; and compare two
commits.

Every write either adopts its own earlier attempt or is fenced. A pull
request and a review carry `Issues.withWriteMarker`'s marker, so after
`outcomeUnknown` a step finds them with `findPullByHead` or
`findReviewByWrite`. `mergePull` sends the head SHA the person saw, and
GitHub answers 409 when it moved. `createOnBranch` sends the branch's expected
head and fails `status: 409, stale: true` when it moved. Nothing here moves an
existing ref by force.

```ts
yield* GitHub.Refs.createBranch("OWNER", "REPO", { name: "smithers/t1-readme", sha: base })
const head = yield* GitHub.Commits.createOnBranch("OWNER", "REPO", {
  branch: "smithers/t1-readme",
  expectedHeadOid: base,
  headline: "T1: Add a line to README",
  additions: [{ path: "README.md", contents: btoa("# Scratch\n\nA line\n") }],
  deletions: []
})
const pull = yield* GitHub.Pulls.createPull("OWNER", "REPO", {
  head: "smithers/t1-readme",
  base: "main",
  title: "T1: Add a line to README",
  body: GitHub.Issues.withWriteMarker("Fixes #3", writeId)
})
yield* GitHub.Pulls.mergePull("OWNER", "REPO", pull.number, { sha: head, method: "squash" })
```

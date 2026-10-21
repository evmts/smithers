---
"@smthrs/integrations": minor
---

Adds issue labels to `GitHub.Issues`, and adds `GitHub.Contents` and
`GitHub.Collaborators`.

`GitHub.Issues.Issue` now carries `labels`, each narrowed to its `name`; an
issue payload without them decodes as having none. Code that builds an
`Issue` value by hand adds `labels: []`.

`addLabels`, `removeLabel` and `createLabel` write labels. Each is idempotent
at GitHub, so a lost answer fails `retryable`, not `outcomeUnknown`.
`removeLabel` answers `false` on a 404 and `createLabel` answers `false` on a
422, when the label exists.

`GitHub.Contents.getText` reads a file's text at a ref, and
`GitHub.Collaborators.permission` reads an account's permission on a
repository. Each answers `Option.none()` on a 404 and validates the path, ref
or login before it becomes a request.

```ts
yield* GitHub.Issues.createLabel("OWNER", "REPO", { name: "smithers:accepted", color: "0e8a16" })
yield* GitHub.Issues.addLabels("OWNER", "REPO", 7, ["smithers:accepted"])
yield* GitHub.Issues.removeLabel("OWNER", "REPO", 7, "smithers:not-accepted")

const guidelines = yield* GitHub.Contents.getText("OWNER", "REPO", ".smithers/triage.md", { ref: "main" })
const access = yield* GitHub.Collaborators.permission("OWNER", "REPO", "maya")
```

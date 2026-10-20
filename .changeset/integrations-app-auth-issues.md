---
"@smthrs/integrations": minor
---

Adds `GitHub.AppAuth` and `GitHub.Issues`.

`GitHub.AppAuth` authenticates as a GitHub App through WebCrypto: it imports the
App's private key as GitHub downloads it (PKCS#1 PEM) or as PKCS#8, signs the
RS256 JWT on the `Clock` service's time, finds the installation covering a
repository, and mints installation tokens narrowed to repositories and
permissions. Neither the key, the JWT, nor a minted token appears in an error
or a span.

`GitHub.Issues` reads and writes issues and issue comments over the
`GitHubClient` in context. Each body carries a hidden
`<!-- smithers:write=<id> -->` marker, so a step whose POST failed
`outcomeUnknown` finds and adopts its own write instead of posting twice.

```ts
const app = yield* GitHub.AppAuth.make({ appId, privateKey })
const { id } = yield* app.installation("OWNER", "REPO")
const { token } = yield* app.installationToken({ installationId: id, permissions: { issues: "write" } })

const found = yield* GitHub.Issues.findIssueByWrite("OWNER", "REPO", { writeId, since })
const issue = Option.isSome(found)
  ? found.value
  : yield* GitHub.Issues.createIssue("OWNER", "REPO", { title, body: GitHub.Issues.withWriteMarker(body, writeId) })
```

---
"@smthrs/integrations": minor
---

Adds `GitHub.Statuses`, write-only commit statuses: `Statuses.create(owner, repo, sha, { state, context, description?, targetUrl? })`
reports one check's state (`pending`, `success`, `failure`, `error`) on one exact commit, so branch protection can require
it by its context. An App's installation token needs `statuses: write`. A lost answer fails `retryable`, never
`outcomeUnknown`, since repeating a status changes nothing anyone reads.

```ts
yield* GitHub.Statuses.create("smithersai", "smithers", headSha, {
  state: "success",
  context: "smithers/lint",
  targetUrl: "https://app.example/smithersai/smithers/pull/7/checks"
})
```

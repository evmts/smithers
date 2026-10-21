---
"@smthrs/integrations": minor
---

Adds `count` to `GitHub.GitHubClient`, and `lastPageNumber`.

`count(path)` asks for one item per page and reads the `rel="last"` link's
page, so a repository's branches, tags, commits or contributors are counted in
one request without walking them. It also answers the list's first item. A
list with no `last` link holds what its one page holds. Code that builds a
`GitHubClient` value by hand adds `count`.

```ts
const commits = yield* client.count("/repos/OWNER/REPO/commits")
// commits.total: how many; commits.first: the newest, as parsed JSON
```

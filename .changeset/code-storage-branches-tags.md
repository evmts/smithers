---
"@smthrs/effect-code-storage": minor
---

`CodeStorage.Client` lists a repository's branches and tags:
`listBranches(repo, { cursor?, limit? })` answers `{ branches, nextCursor, bytesRead }`, each branch
`{ name, sha, createdAt }` with `sha` its head commit, and `listTags(repo, { cursor?, limit? })` answers
`{ tags, nextCursor, bytesRead }`, each tag `{ name, sha }` with `sha` the commit it names. Both need `git:read`
and fail with a `CodeStorageError` whose `operation` is `listBranches` or `listTags`.

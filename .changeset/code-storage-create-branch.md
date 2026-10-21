---
"@smthrs/effect-code-storage": minor
---

`CodeStorage.Client.createBranch(repo, { branch, from })` creates a branch at the commit another ref names, with a
`git:write` token for that repository, through `POST /api/repos/<repo>/branches/create`: no clone and no push. It
answers `{ branch, sha }`; a branch that exists fails with `conflict`, a `from` Code Storage can't resolve with
`ref_not_found`, and the error's `operation` is `createBranch`.

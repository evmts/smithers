---
"@smthrs/effect-code-storage": minor
---

Add `CodeStorage.Client.deleteRepo(repo)` using `DELETE /api/repos/{repo_name}`
and a five-minute token for exactly that repository with only `repo:write`.
Deletion acceptance returns `void`; missing and already-deleted repositories
remain typed errors. Reuse bounded failure mapping, request metrics and spans.

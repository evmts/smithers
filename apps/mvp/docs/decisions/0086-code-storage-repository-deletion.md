# 0086 — Code Storage repository deletion

2026-10-23. Implements the deployer's SDK-1 request for repository cleanup.

Use `CodeStorage.Client.deleteRepo(repo)` from the library catalog's
`@smthrs/effect-code-storage` entry. Code Storage's
[OpenAPI specification](https://code.storage/docs/openapi.json), read 2026-10-23,
declares `DELETE /api/repos/{repo_name}` at `https://api.<org>.code.storage`,
with `repo:write` on that repository alone.

The SDK returns `void` when deletion is accepted; hot and cold storage cleanup
continues asynchronously. Preserve HTTP 404 `not_found` / `repository_not_found`
and HTTP 409 `repository_deleted` as typed errors, matching the existing request
helper. The caller decides whether absence satisfies its cleanup policy.
Transport failures may hide an accepted deletion; the client never retries.

No production request is part of this change. The deployer removes the scratch
repositories after the SDK lands.

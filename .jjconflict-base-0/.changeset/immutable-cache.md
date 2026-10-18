---
"@smthrs/artifacts": minor
"@smthrs/platform-cloudflare": minor
"@smthrs/platform-browser": minor
---

Add `ImmutableCache`: bytes and small string metadata under a key that names
content which never changes, such as a repository's file at a commit SHA. It
has no invalidation; an entry holds at most 8 MiB of bytes and 1,024 bytes of
metadata. `ImmutableCache.readThrough(key, compute)` answers from the cache,
else computes and stores, never stores a failure, and still answers when the
cache itself fails. Telemetry counts `immutable_cache_requests` and
`immutable_cache_bytes` by backend, namespace, operation and outcome, and never
carries a key's parts or an entry's content.

```ts
import { ImmutableCache } from "@smthrs/artifacts"

const file = ImmutableCache.readThrough(ImmutableCache.key("repo.blob", repo, sha, path), readFile(repo, sha, path))
```

The layers: `ImmutableCache.layerMemory()` in `@smthrs/artifacts` for Node
and tests, `EdgeCache.layer({ name })` in `@smthrs/platform-cloudflare` over
the Workers Cache API, and `BrowserCache.layer()` in
`@smthrs/platform-browser` over Cache Storage.

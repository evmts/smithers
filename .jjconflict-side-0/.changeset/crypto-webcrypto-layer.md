---
"@smthrs/crypto": minor
"@smthrs/platform-cloudflare": major
"@smthrs/platform-node": patch
---

Add `WebCrypto` to `@smthrs/crypto`: Effect's `Crypto` service over the global
WebCrypto, for Node, Bun, browsers and Cloudflare Workers. `WebCrypto.make()`
returns the service and `WebCrypto.layer` provides it. `randomBytes` fills in
chunks of at most 65,536 bytes, the Web Crypto limit, and reads randomness only
when a caller asks for it. `digest` maps a WebCrypto rejection to a
`PlatformError` with reason `Unknown`, module `Crypto` and method `digest`.

```ts
import { digest, WebCrypto } from "@smthrs/crypto"

const address = digest("hello").pipe(Effect.provide(WebCrypto.layer))
```

It replaces the per-package copies. `CloudflareHost.layerCrypto` is removed from
`@smthrs/platform-cloudflare`; `CloudflareHost.layer` still provides `Crypto`,
now through `WebCrypto.layer`. Import `WebCrypto` from `@smthrs/crypto` where
you used `layerCrypto` on its own. The `SandboxedFlow` guest in
`@smthrs/platform-node` uses the same layer, which fixes a guest request for more
than 65,536 random bytes failing with `QuotaExceededError`.

RC releases carry no stability commitment ([RELEASE_SUPPORT.md (MVP compatibility changes)](../RELEASE_SUPPORT.md#mvp-compatibility-changes)).

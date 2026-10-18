---
"@smthrs/integrations": major
---

The root entry runs in a browser, a Cloudflare Worker, Node and Bun. Webhook
signatures and PKCE use WebCrypto instead of `node:crypto`, so
`Core.Signature.verifySignature`, `Core.Signature.computeHmacSha256Hex`,
`Core.Pkce.deriveCodeChallenge` and `Core.Pkce.createPkcePair` return Effects.
`Core.Pkce.createCodeVerifier` and `Core.Signature.constantTimeEqual` are
unchanged. `Core.Channel.make` accepts a `verify` that returns
`Effect<boolean>`; only `true` verifies, and a failure or defect refuses the
delivery. `Environment.ambientEnvironment()` is `{}` on a host without a
process environment instead of throwing.

```ts
// Before
const verified = Core.Signature.verifySignature({ payload, secret, signature })
const pair = Core.Pkce.createPkcePair()
// After
const verified = yield* Core.Signature.verifySignature({ payload, secret, signature })
const pair = yield* Core.Pkce.createPkcePair()
```

A base64 signature with padding that does not end a quantum, such as an extra
`=`, no longer verifies.

RC releases carry no stability commitment ([RELEASE_SUPPORT.md (MVP compatibility changes)](../RELEASE_SUPPORT.md#mvp-compatibility-changes)).

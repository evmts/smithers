---
"@smthrs/crypto": minor
---

Adds `Uuid.v5(namespace, name)`: the RFC 9562 name-based (version 5) UUID of `name` in `namespace`, over the injected
`effect/Crypto` service, so a device offline and a server derive the same id. `Uuid.isUuid` checks the canonical form.

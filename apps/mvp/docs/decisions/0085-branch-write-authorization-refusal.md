# 0085 — A denied forge write is terminal

2026-10-23. Production `/new` records Code Storage `create_ref` HTTP 401
`unauthorized`, translated to 503 `unavailable` and retried by the device engine.

Map Code Storage branch-write HTTP 401 and 403 to `CreateRefused.forbidden`
and the branch route's existing 403 `forbidden`. Both `branch/create` and
`conversation/new` already treat `BranchTrackRefused` as non-retryable. The
provider's status must not be mistaken for the person's expired Smithers session.
Keep `forgeOperation`, `forgeErrorTag`, `forgeErrorCode` and `forgeStatus` in the
existing logs and spans; never include a credential or provider response text.
Per the brief, even a provider 403 `authentication_unavailable` is terminal here.
Other response mappings remain as before.

Library catalog entries: `@smthrs/effect-code-storage` for ref writes and
`@smthrs/flow` for the existing durable retry policy. This repairs the core forge
adapter and route used by the plugins; it adds no feature or private plugin API.

Credential investigation: clone import and branch creation use the same SDK
signer and canonical `github/<owner>/<name>` ID. Import requests `repo:write`;
upstream pull and branch creation request `git:write`; reads request `git:read`.
Tokens use ES256, organization `iss`, repository `repo`, current Effect Clock
seconds and `exp = iat + 300`. There is no namespace claim. A clone passes its
canonical ID to createRepo, pullUpstream and subsequent reads; the Forge derives
the same ID. The SDK does not substitute the create response's opaque repo ID.

The [branch API](https://code.storage/docs/api/repos/branch-create) documents
`git:write`. The [authentication guide](https://code.storage/docs/platform/authentication)
documents restricted-key `allowed_scopes`: requesting a disallowed scope fails
verification. If this is the deployment defect, the registered key backing
`CODE_STORAGE_KEY` on ChatApi must allow `git:write`, alongside `git:read`;
FlowExecution's cloning key also needs `repo:write`. This is a conditional check,
not an established cause or permission change. The successful upstream pull also
requests `git:write`, so clone success alone cannot identify a scope restriction.

The deployed key, its allowlist and current repository metadata are unavailable
in this clone. The documented old `~/.zshrc` key source is absent too. The
remaining 401 cause requires the deployment's existing credential/config source
and an authenticated reproduction through the Effect wrapper. No speculative
scope or namespace change, push, deployment or production e2e is included.

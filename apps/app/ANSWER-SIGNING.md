# Signed HumanTask answers

A `kind: "json"` HumanTask can mark one top-level schema property with
`format: "webauthn-assertion"` (usually an object named `evidence`). The person
enters the answer object and presses Send answer. The form requests a passkey
with `userVerification: "required"` and `rpId: location.hostname`, then puts the
assertion in that property before submitting through the existing answer path.
An existing value in that property is discarded. Cancellation, failure or edits
while signing submit nothing; the draft remains available to sign again.

The challenge is the 32 SHA-256 bytes of the UTF-8 encoding of:

```ts
JSON.stringify([
  "smithers-answer/v1",
  waitRunId,
  waitName,
  canonicalJson(answerWithoutEvidenceProperty),
  issuedAt
])
```

`waitRunId` is the execution holding the wait, not the outer control run ID.
`waitName` is the HumanTask's declared name. `issuedAt` is an ISO UTC timestamp
from `new Date().toISOString()`. WebAuthn encodes these challenge bytes as
unpadded base64url in `clientDataJSON.challenge`.

Canonical JSON recursively sorts object keys lexicographically by UTF-16 code
units, retains array order, and uses JSON.stringify for keys and primitives.
It contains no whitespace and performs no Unicode normalization. Numeric-looking
keys sort lexicographically too; object reconstruction through JSON.stringify
would incorrectly reorder them. The input must be a JSON value.

The evidence object has exactly these fields:

```ts
{ kind: "webauthn", version: "smithers-answer/v1", issuedAt,
  credentialId, clientDataJSON, authenticatorData, signature, userHandle }
```

All binary fields are unpadded base64url strings. `credentialId` encodes `rawId`;
`userHandle` is an empty string when the authenticator returns null.

Signing requires a secure context and a hostname rather than an IP address.
Loopback development uses `http://localhost:<port>`.

The annotation transports proof; it does not establish identity. The receiving
flow must verify credential enrollment, client data type, challenge and allowed
origin, rpIdHash, user presence and verification, signature, freshness and replay
policy before accepting the answer. Bind verification to the current wait.

# Signed answers

A JSON HumanTask may mark exactly one depth-1 property with
`format: "webauthn-assertion"`. Its `type` must be absent or `"object"`.
Root, nested, array-item, mistyped and multiple markers are refused at schema
validation. The property name comes from the schema; it need not be `evidence`.
The app discards that property's supplied value and replaces it with proof.

Signing follows an explicit Send answer. It uses `rpId: location.hostname` and
`userVerification: "required"`. No `allowCredentials` is passed: enrollment must
create a discoverable (resident) credential for that relying party. A secure
context and a hostname are required; local development uses
`http://localhost:<port>`. Cancellation, failure or an edit while signing sends
nothing and preserves the draft.

## Challenge

The challenge is the 32 raw bytes of SHA-256 over the UTF-8 RFC 8785 (JCS)
serialization of this one array:
`["smithers-answer/v1", waitRunId, waitName, askId, answerWithoutMarkedProperty, issuedAt]`.
The answer is a JSON value embedded in the array, never a serialized string.
WebAuthn puts the unpadded base64url encoding in `clientDataJSON.challenge`.

`waitRunId` is the execution holding the wait, not the outer control run ID.
`waitName` is the HumanTask's declared name. `askId` is a nonempty string
`request.requestId` carried in the approval's HumanTask request payload, when
present; otherwise it is `String(requestedAt)`, the current ask's Unix timestamp
in milliseconds received in the approval snapshot. The gateway's outer
`requestId` / `payload.target.requestId` is a synthesized wait name and attempt,
which may repeat in a loop: it is not a per-ask request ID and is never used here.
Cards carry the chosen identity as `question.askId`.

A flow that verifies its own answers should set HumanTask
`requestId` to a per-ask identity it knows, for example `requestId: "release-ask-1"`.
It can then recompute the challenge without reading runtime state. Each new ask
using the same wait name must have its own requestId; retain that identity across
replay of the same ask. The optional field is nonempty, well-formed text bounded
to 1024 JSON-encoded UTF-8 bytes (including quotes and escapes).
Missing ask identity refuses signing. `issuedAt` is ISO UTC from
`new Date().toISOString()`.

The signing domain is I-JSON with finite binary64 numbers and integers within
±2^53 inclusive, Unicode strings without lone surrogates, and no duplicate object
keys. The app checks the original draft before parsing loses duplicate keys or
rounds out-of-range integers. Higher precision values must be strings.
Within this domain the existing recursive key-sorted JSON.stringify serializer
matches JCS: UTF-16 key ordering, ECMAScript primitive encoding, array order,
no whitespace and no Unicode normalization. Numeric-looking keys sort as strings.
The unit suite includes the published RFC 8785 §3.2.3 property-sorting vector.
See [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html).

## Golden

Full input: `waitRunId="run-123"`, `waitName="decision"`, `askId="ask-1"`,
`answer={"z":[true,null],"a":1,"evidence":{"ignored":true}}`,
`schema={"type":"object","properties":{"evidence":{"type":"object","format":"webauthn-assertion"}}}`,
`issuedAt="2026-10-18T12:00:00.000Z"`.
Exact preimage bytes (UTF-8, no BOM or trailing newline):

```json
["smithers-answer/v1", "run-123", "decision", "ask-1", { "a": 1, "z": [true, null] }, "2026-10-18T12:00:00.000Z"]
```

Expected base64url challenge: `Fv40wrBkEJzgrMK98cMsstf1TYjSu5oDuAxmyr_R4YU`.

## Evidence and verifier duties

The marked property carries exactly
`{kind:"webauthn", version:"smithers-answer/v1", issuedAt, credentialId, clientDataJSON, authenticatorData, signature, userHandle}`.
Binary fields are unpadded base64url. `credentialId` encodes `rawId`;
`userHandle` is `""` if the authenticator returns null.

The receiving verifier must recompute the challenge from the question it asked,
including that question's schema-selected marked property and askId; never trust
binding inputs supplied by the answer. Check the origin allowlist, the enrolled
credential and the signature, client data type `webauthn.get`, rpIdHash, user
presence and user verification. Enforce freshness with `notBefore` at the current
ask's time, a maximum age and a bounded future-clock tolerance. Persist consumed
(waitRunId, waitName, askId) triples, never the askId alone, and record a
replayed askId within the same wait as unverified, without applying the answer again. The `String(requestedAt)`
fallback cannot repeat within one wait, because a wait's asks are sequential; a
flow-supplied `requestId` is unique only if the flow keeps it so. Proof transport
alone does not authenticate signal admission.

import { expect, test } from "bun:test"
import { answerChallenge, base64url, canonicalJson, assertionEvidence, signingProperty } from "./AnswerSigning"

test("canonical JSON sorts nested keys and preserves arrays", () => {
  expect(canonicalJson({ z: [{ b: 2, a: "é" }], a: null })).toBe('{"a":null,"z":[{"a":"é","b":2}]}')
  expect(canonicalJson({ "10": 1, "2": 2 })).toBe('{"10":1,"2":2}')
})
test("challenge binds fixed run, wait, canonical answer and timestamp (golden)", async () => {
  expect(base64url(await answerChallenge("run-123", "decision", { z: [true, null], a: 1 }, "2026-10-18T12:00:00.000Z")))
    .toBe("2rWpXKHpO0pJdaJQyreRT32otwpM66HOTBOWkufXplA")
})
test("assertion evidence is versioned and all binary fields are unpadded base64url", () => {
  const bytes = new Uint8Array([251, 255]).buffer
  expect(assertionEvidence({ rawId: bytes, response: { clientDataJSON: bytes, authenticatorData: bytes, signature: bytes, userHandle: null } } as PublicKeyCredential, "now"))
    .toEqual({ kind: "webauthn", version: "smithers-answer/v1", issuedAt: "now", credentialId: "-_8", clientDataJSON: "-_8", authenticatorData: "-_8", signature: "-_8", userHandle: "" })
})
test("only the declared schema property requests signing; ambiguity fails closed", () => {
  expect(signingProperty({ properties: { proof: { format: "webauthn-assertion" } } })).toBe("proof")
  expect(signingProperty({ properties: { proof: { type: "object" } } })).toBeUndefined()
  expect(() => signingProperty({ properties: { a: { format: "webauthn-assertion" }, b: { format: "webauthn-assertion" } } })).toThrow()
})

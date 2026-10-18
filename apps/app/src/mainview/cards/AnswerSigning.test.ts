import { expect, test } from "bun:test"
import { answerChallenge, base64url, canonicalJson, assertionEvidence, signingProperty, signAnswer } from "./AnswerSigning"

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

test("challenge changes with every bound component", async () => {
  const input = ["run", "wait", { text: "yes" }, "time"] as const
  const baseline = base64url(await answerChallenge(...input))
  for (const args of [ ["other", "wait", { text: "yes" }, "time"], ["run", "other", { text: "yes" }, "time"], ["run", "wait", { text: "no" }, "time"], ["run", "wait", { text: "yes" }, "later"] ] as const) {
    expect(base64url(await answerChallenge(...args))).not.toBe(baseline)
  }
})


test("signing replaces supplied evidence and requires user verification on the page hostname", async () => {
  const original = new Map(["location", "isSecureContext", "navigator"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const bytes = new Uint8Array([1, 2, 3]).buffer
  let options: CredentialRequestOptions | undefined
  try {
    Object.defineProperty(globalThis, "location", { configurable: true, value: { hostname: "localhost", port: "1234", protocol: "http:" } })
    Object.defineProperty(globalThis, "isSecureContext", { configurable: true, value: true })
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { credentials: { get: async (input: CredentialRequestOptions) => {
      options = input
      return { rawId: bytes, response: { clientDataJSON: bytes, authenticatorData: bytes, signature: bytes, userHandle: bytes } }
    } } } })
    const signed = await signAnswer({ text: "yes", evidence: "forged" }, "evidence", "run", "wait")
    expect(signed.text).toBe("yes")
    expect(signed.evidence).toMatchObject({ kind: "webauthn", userHandle: "AQID" })
    expect(options?.publicKey?.rpId).toBe("localhost")
    expect(options?.publicKey?.userVerification).toBe("required")
    expect(options?.publicKey?.challenge).toEqual(await answerChallenge("run", "wait", { text: "yes" }, (signed.evidence as { issuedAt: string }).issuedAt))
    await expect(signAnswer([], "evidence", "run", "wait")).rejects.toThrow("JSON object")
    await expect(signAnswer({}, "evidence", undefined, "wait")).rejects.toThrow("current question")
    Object.defineProperty(globalThis, "isSecureContext", { configurable: true, value: false })
    await expect(signAnswer({}, "evidence", "run", "wait")).rejects.toThrow("Signing needs http://localhost:1234")
  } finally {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})

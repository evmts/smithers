import { expect, test } from "bun:test"
import {
  answerChallenge,
  assertionEvidence,
  base64url,
  canonicalJson,
  parseSigningAnswer,
  signAnswer,
  signingFailure,
  signingProperty
} from "./AnswerSigning"

test("canonical JSON sorts nested keys and preserves arrays", () => {
  expect(canonicalJson({ z: [{ b: 2, a: "é" }], a: null })).toBe("{\"a\":null,\"z\":[{\"a\":\"é\",\"b\":2}]}")
  expect(canonicalJson({ "10": 1, "2": 2 })).toBe("{\"10\":1,\"2\":2}")
})
test("challenge binds fixed run, wait, canonical answer and timestamp (golden)", async () => {
  expect(
    base64url(
      await answerChallenge("run-123", "decision", "ask-1", { z: [true, null], a: 1 }, "2026-10-18T12:00:00.000Z")
    )
  )
    .toBe("Fv40wrBkEJzgrMK98cMsstf1TYjSu5oDuAxmyr_R4YU")
})
test("assertion evidence is versioned and all binary fields are unpadded base64url", () => {
  const bytes = new Uint8Array([251, 255]).buffer
  expect(
    assertionEvidence(
      {
        rawId: bytes,
        response: { clientDataJSON: bytes, authenticatorData: bytes, signature: bytes, userHandle: null }
      } as unknown as PublicKeyCredential,
      "now"
    )
  )
    .toEqual({
      kind: "webauthn",
      version: "smithers-answer/v1",
      issuedAt: "now",
      credentialId: "-_8",
      clientDataJSON: "-_8",
      authenticatorData: "-_8",
      signature: "-_8",
      userHandle: ""
    })
})
test("only the declared schema property requests signing; ambiguity fails closed", () => {
  expect(signingProperty({ properties: { proof: { format: "webauthn-assertion" } } })).toBe("proof")
  expect(signingProperty({ properties: { proof: { type: "object" } } })).toBeUndefined()
  expect(() =>
    signingProperty({ properties: { a: { format: "webauthn-assertion" }, b: { format: "webauthn-assertion" } } })
  ).toThrow()
})

test("challenge changes with every bound component", async () => {
  type Bound = [waitRunId: string, waitName: string, askId: string, answer: unknown, issuedAt: string]
  const input: Bound = ["run", "wait", "ask-1", { text: "yes" }, "time"]
  const baseline = base64url(await answerChallenge(...input))
  const variants: Bound[] = [
    ["other", "wait", "ask-1", { text: "yes" }, "time"],
    ["run", "other", "ask-1", { text: "yes" }, "time"],
    ["run", "wait", "ask-1", { text: "no" }, "time"],
    ["run", "wait", "ask-1", { text: "yes" }, "later"]
  ]
  for (const args of variants) {
    expect(base64url(await answerChallenge(...args))).not.toBe(baseline)
  }
})

test("signing replaces supplied evidence and requires user verification on the page hostname", async () => {
  const original = new Map(
    ["location", "isSecureContext", "navigator"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  const bytes = new Uint8Array([1, 2, 3]).buffer
  let options: CredentialRequestOptions | undefined
  try {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { hostname: "localhost", port: "1234", protocol: "http:" }
    })
    Object.defineProperty(globalThis, "isSecureContext", { configurable: true, value: true })
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        credentials: {
          get: async (input: CredentialRequestOptions) => {
            options = input
            return {
              rawId: bytes,
              response: { clientDataJSON: bytes, authenticatorData: bytes, signature: bytes, userHandle: bytes }
            }
          }
        }
      }
    })
    const signed = await signAnswer({ text: "yes", evidence: "forged" }, "evidence", "run", "wait", "ask-1")
    expect(signed.text).toBe("yes")
    expect(signed.evidence).toMatchObject({ kind: "webauthn", userHandle: "AQID" })
    expect(options?.publicKey?.rpId).toBe("localhost")
    expect(options?.publicKey?.userVerification).toBe("required")
    expect(options?.publicKey?.challenge).toEqual(
      await answerChallenge("run", "wait", "ask-1", { text: "yes" }, (signed.evidence as { issuedAt: string }).issuedAt)
    )
    await expect(signAnswer([], "evidence", "run", "wait", "ask-1")).rejects.toThrow("JSON object")
    await expect(signAnswer({}, "evidence", undefined, "wait", "ask-1")).rejects.toThrow("current question")
    expect(options?.publicKey?.allowCredentials).toBeUndefined()
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { hostname: "127.0.0.1", port: "1234", protocol: "http:" }
    })
    await expect(signAnswer({}, "evidence", "run", "wait", "ask-1")).rejects.toThrow(
      "Signing needs http://localhost:1234"
    )
    Object.defineProperty(globalThis, "isSecureContext", { configurable: true, value: false })
    await expect(signAnswer({}, "evidence", "run", "wait", "ask-1")).rejects.toThrow(
      "Signing needs http://localhost:1234"
    )
  } finally {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})

test("I-JSON refuses ambiguous and nonrepresentable answers before signing", () => {
  for (
    const text of [
      "{\"x\":1,\"x\":2}",
      "{\"x\":1,\"\\u0078\":2}",
      "{\"a\":{\"x\":1,\"x\":2}}",
      "{\"n\":9007199254740993}",
      "{\"n\":9007199254740993e0}",
      "{\"n\":9007199254740992.1}",
      "{\"n\":1e400}",
      "{\"s\":\"\\ud800\"}"
    ]
  ) {
    expect(() => parseSigningAnswer(text)).toThrow()
  }
  for (const value of [NaN, Infinity, -Infinity, 9007199254740994, "\ud800", { "\udfff": 1 }]) {
    expect(() => canonicalJson(value)).toThrow()
  }
  for (const text of ["9007199254740992.0", "-9007199254740992e0", "90071992547409920e-1"]) {
    expect(() => parseSigningAnswer(text)).not.toThrow()
  }
  expect(canonicalJson(parseSigningAnswer("{\"n\":9007199254740992,\"s\":\"😀\"}"))).toBe(
    "{\"n\":9007199254740992,\"s\":\"😀\"}"
  )
})
test("RFC 8785 section 3.2.3 published property sorting vector", () => {
  const input = {
    "\u20ac": "Euro Sign",
    "\r": "Carriage Return",
    "\ufb33": "Hebrew Letter Dalet With Dagesh",
    "1": "One",
    "😀": "Emoji: Grinning Face",
    "\u0080": "Control",
    "ö": "Latin Small Letter O With Diaeresis"
  }
  expect(Object.keys(JSON.parse(canonicalJson(input)))).toEqual(["1", "\r", "\u0080", "ö", "€", "😀", "דּ"])
  expect(canonicalJson([333333333.33333329, 4.50, 2e-3, 1e-27, -0])).toBe("[333333333.3333333,4.5,0.002,1e-27,0]")
})
test("same-named asks bind their own askId", async () => {
  expect(base64url(await answerChallenge("run", "wait", "ask-1", {}, "time"))).not.toBe(
    base64url(await answerChallenge("run", "wait", "ask-2", {}, "time"))
  )
})

test("signing refusals present the exact authored sentence, without exposing unknown errors", () => {
  const cases: ReadonlyArray<readonly [() => unknown, string]> = [
    [() => canonicalJson("\ud800"), "Signing needs Unicode strings without lone surrogates."],
    [() => canonicalJson(Infinity), "Signing needs finite I-JSON numbers and integers within ±2^53."],
    [() => canonicalJson(undefined), "Signing needs a JSON answer."],
    [
      () =>
        signingProperty({ properties: { a: { format: "webauthn-assertion" }, b: { format: "webauthn-assertion" } } }),
      "Signing needs exactly one evidence property."
    ],
    [() => parseSigningAnswer("{\"x\":1,\"x\":2}"), "Signing refuses duplicate JSON keys."],
    [() => parseSigningAnswer("9007199254740993"), "Signing needs I-JSON integers within ±2^53."]
  ]
  for (const [act, sentence] of cases) {
    let caught: unknown
    try {
      act()
    } catch (error) {
      caught = error
    }
    expect(signingFailure(caught)).toMatchObject({ tag: "SigningRefused", sentence })
  }
  expect(signingFailure(new Error("private diagnostic")).sentence).toBe("Authenticator unavailable")
})

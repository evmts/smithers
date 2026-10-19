import { digestSync } from "@smthrs/crypto"
/** RFC 8785 (JCS), restricted to the signing I-JSON domain. JSON keys sort lexicographically by UTF-16 code units at every depth; arrays
 * retain order. JSON primitives use JSON.stringify, with no whitespace. Inputs
 * are JSON values (the form parses JSON before signing). No Unicode normalization.
 */
export const canonicalJson = (value: unknown): string => {
  if (typeof value === "string" && !value.isWellFormed()) throw new Error("Signing needs Unicode strings without lone surrogates.")
  if (typeof value === "number" && (!Number.isFinite(value) || (Number.isInteger(value) && Math.abs(value) > 2 ** 53))) throw new Error("Signing needs finite I-JSON numbers and integers within ±2^53.")
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${canonicalJson(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error("Signing needs a JSON answer.")
  return encoded
}
export const base64url = (bytes: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
// The shared synchronous SHA-256 (repo rule: no crypto.subtle in shipped app code); the challenge is its raw 32 bytes.
export const answerChallenge = async (waitRunId: string, waitName: string, askId: string, answer: unknown, issuedAt: string): Promise<ArrayBuffer> =>
  Uint8Array.from(digestSync(canonicalJson(["smithers-answer/v1", waitRunId, waitName, askId, answer, issuedAt])).match(/../g)!, byte => parseInt(byte, 16)).buffer

export const signingProperty = (schema: unknown): string | undefined => {
  const properties = (schema as { properties?: Record<string, { format?: unknown }> } | undefined)?.properties
  const keys = Object.entries(properties ?? {}).filter(([, value]) => value?.format === "webauthn-assertion").map(([key]) => key)
  if (keys.length > 1) throw new Error("Signing needs exactly one evidence property.")
  return keys[0]
}
export const assertionEvidence = (credential: PublicKeyCredential, issuedAt: string) => {
  const response = credential.response as AuthenticatorAssertionResponse
  return { kind: "webauthn" as const, version: "smithers-answer/v1" as const, issuedAt,
    credentialId: base64url(credential.rawId), clientDataJSON: base64url(response.clientDataJSON),
    authenticatorData: base64url(response.authenticatorData), signature: base64url(response.signature),
    userHandle: response.userHandle === null ? "" : base64url(response.userHandle) }
}
/** This is proof transport only: the receiving flow must verify the assertion,
 * enrollment, origin, freshness and replay policy before trusting an answer. */
export const signAnswer = async (answer: unknown, property: string, waitRunId: string | undefined, waitName: string | undefined, askId: string | undefined): Promise<Record<string, unknown>> => {
  const hostname = location.hostname
  if (!isSecureContext || /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(":"))
    throw new Error(`Signing needs http://localhost:${location.port || (location.protocol === "https:" ? "443" : "80")}`)
  if (!waitRunId || !waitName || !askId) throw new Error("Signing needs the current question.")
  if (answer === null || typeof answer !== "object" || Array.isArray(answer)) throw new Error("Signing needs a JSON object.")
  const unsigned = Object.fromEntries(Object.entries(answer).filter(([key]) => key !== property))
  const issuedAt = new Date().toISOString()
  const credential = await navigator.credentials.get({ publicKey: {
    rpId: hostname, challenge: await answerChallenge(waitRunId, waitName, askId, unsigned, issuedAt), userVerification: "required"
  } }) as PublicKeyCredential | null
  if (credential === null) throw new Error("Signing cancelled. Try again.")
  return { ...unsigned, [property]: assertionEvidence(credential, issuedAt) }
}

/** Parse the original draft before JSON.parse can erase duplicate member names. */
export const parseSigningAnswer = (text: string): unknown => {
  const value: unknown = JSON.parse(text)
  const tokens = text.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g) ?? []
  let index = 0
  const walk = (): void => {
    const token = tokens[index++]
    if (token === "{") {
      const keys = new Set<string>()
      while (tokens[index] !== "}") {
        const key = JSON.parse(tokens[index++]!) as string
        if (keys.has(key)) throw new Error("Signing refuses duplicate JSON keys.")
        keys.add(key)
        index++ // colon (syntax already validated by JSON.parse)
        walk()
        if (tokens[index] !== ",") break
        index++
      }
      index++
    } else if (token === "[") {
      while (tokens[index] !== "]") {
        walk()
        if (tokens[index] !== ",") break
        index++
      }
      index++
    } else if (token && /^-?\d/.test(token) && Math.abs(Number(token)) >= 2 ** 53) {
      // Check the original decimal too: parsing 9007199254740993 rounds down.
      const [mantissa, exponent = "0"] = token.toLowerCase().replace(/^-/, "").split("e")
      const [whole, fraction = ""] = mantissa!.split(".")
      const digits = (whole! + fraction).replace(/^0+/, "").replace(/0+$/, "")
      const scale = Number(exponent) - fraction.length + (whole! + fraction).length - (whole! + fraction).replace(/0+$/, "").length
      if (digits !== "9007199254740992" || scale !== 0) throw new Error("Signing needs I-JSON integers within ±2^53.")
    }
  }
  walk()
  canonicalJson(value)
  return value
}

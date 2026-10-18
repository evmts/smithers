/** JSON keys sort lexicographically by UTF-16 code units at every depth; arrays
 * retain order. JSON primitives use JSON.stringify, with no whitespace. Inputs
 * are JSON values (the form parses JSON before signing). No Unicode normalization.
 */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error("Signing needs a JSON answer.")
  return encoded
}
export const base64url = (bytes: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
export const answerChallenge = async (waitRunId: string, waitName: string, answer: unknown, issuedAt: string): Promise<ArrayBuffer> =>
  crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["smithers-answer/v1", waitRunId, waitName, canonicalJson(answer), issuedAt])))

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
export const signAnswer = async (answer: unknown, property: string, waitRunId: string | undefined, waitName: string | undefined): Promise<Record<string, unknown>> => {
  const hostname = location.hostname
  if (!isSecureContext || /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(":"))
    throw new Error(`Signing needs http://localhost:${location.port || (location.protocol === "https:" ? "443" : "80")}`)
  if (!waitRunId || !waitName) throw new Error("Signing needs the current question.")
  if (answer === null || typeof answer !== "object" || Array.isArray(answer)) throw new Error("Signing needs a JSON object.")
  const unsigned = Object.fromEntries(Object.entries(answer).filter(([key]) => key !== property))
  const issuedAt = new Date().toISOString()
  const credential = await navigator.credentials.get({ publicKey: {
    rpId: hostname, challenge: await answerChallenge(waitRunId, waitName, unsigned, issuedAt), userVerification: "required"
  } }) as PublicKeyCredential | null
  if (credential === null) throw new Error("Signing cancelled. Try again.")
  return { ...unsigned, [property]: assertionEvidence(credential, issuedAt) }
}

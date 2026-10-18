/**
 * Offline verification for explicit converter shares. No fetch or conversion
 * call is needed; the publishing origin pins the operator's public key.
 * @since 0.1.0
 */

/** Fields authenticated by a converter receipt.
 * @category models
 * @since 0.1.0
 */
export interface ConversionEvidence {
  readonly state: "compiled" | "diagnostics"
  readonly effeckVersion: string
  readonly receipt: {
    readonly inputSha: string
    readonly outputSha: string
    readonly compilerDigest: string
    readonly dependenciesDigest: string
    readonly signature: string
  }
}
/** Versioned UTF-8 signature encoding, including the final newline.
 * @category utilities
 * @since 0.1.0
 */
export const conversionReceiptMessage = (result: ConversionEvidence): string => [
  "smithers.convert.v1", result.state, result.effeckVersion, result.receipt.inputSha,
  result.receipt.outputSha, result.receipt.compilerDigest, result.receipt.dependenciesDigest, ""
].join("\n")

/** Validate both content hashes before accepting the operator's signature.
 * @category utilities
 * @since 0.1.0
 */
export const verifyConversionReceipt = async (input: string, output: string, result: ConversionEvidence, publicKey: string): Promise<boolean> => {
  try {
    if (!["compiled", "diagnostics"].includes(result.state) || !/^[a-zA-Z0-9.+_-]{1,64}$/.test(result.effeckVersion)) return false
    const receipt = result.receipt
    if (![receipt.inputSha, receipt.outputSha].every(value => /^[a-f0-9]{64}$/.test(value)) ||
      ![receipt.compilerDigest, receipt.dependenciesDigest].every(value => /^(sha256:)?[a-f0-9]{64}$/.test(value))) return false
    const encode = (value: string) => new TextEncoder().encode(value)
    if ([input, output].some(value => new TextDecoder().decode(encode(value)) !== value)) return false
    const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", encode(value)))].map(byte => byte.toString(16).padStart(2, "0")).join("")
    if (await hash(input) !== receipt.inputSha || await hash(output) !== receipt.outputSha) return false
    const decode = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0))
    const key = await crypto.subtle.importKey("raw", decode(publicKey), "Ed25519", false, ["verify"])
    return await crypto.subtle.verify("Ed25519", key, decode(receipt.signature), encode(conversionReceiptMessage(result)))
  } catch { return false }
}

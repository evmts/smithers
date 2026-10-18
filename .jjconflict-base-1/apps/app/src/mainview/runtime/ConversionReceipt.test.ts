import { expect, test } from "bun:test"
import { conversionReceiptMessage, verifyConversionReceipt, type ConversionEvidence } from "./ConversionReceipt"

const signedShare = async () => {
  const keys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]) as CryptoKeyPair
  const hash = async (value: string) => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))).toString("hex")
  const result: ConversionEvidence = { state: "compiled", effeckVersion: "0.0.1", receipt: {
    inputSha: await hash("source"), outputSha: await hash("output"), compilerDigest: "a".repeat(64), dependenciesDigest: "b".repeat(64), signature: ""
  } }
  const signature = Buffer.from(await crypto.subtle.sign("Ed25519", keys.privateKey, new TextEncoder().encode(conversionReceiptMessage(result)))).toString("base64")
  const signed = { ...result, receipt: { ...result.receipt, signature } }
  const publicKey = Buffer.from(await crypto.subtle.exportKey("raw", keys.publicKey)).toString("base64")
  return { signed, publicKey }
}

test("a valid share reads as unverified on a plain-HTTP install, which has no SubtleCrypto", async () => {
  const { signed, publicKey } = await signedShare()
  const was = Object.getOwnPropertyDescriptor(globalThis, "isSecureContext")
  Object.defineProperty(globalThis, "isSecureContext", { value: false, configurable: true })
  try {
    expect(await verifyConversionReceipt("source", "output", signed, publicKey)).toBe(false)
  } finally {
    if (was) Object.defineProperty(globalThis, "isSecureContext", was)
    else delete (globalThis as { isSecureContext?: boolean }).isSecureContext
  }
  expect(await verifyConversionReceipt("source", "output", signed, publicKey)).toBe(true)
})

test("a share verifies offline and loses its evidence after any signed field or content changes", async () => {
  const keys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]) as CryptoKeyPair
  const hash = async (value: string) => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))).toString("hex")
  const result: ConversionEvidence = { state: "compiled", effeckVersion: "0.0.1", receipt: {
    inputSha: await hash("source"), outputSha: await hash("output"), compilerDigest: "a".repeat(64), dependenciesDigest: "b".repeat(64), signature: ""
  } }
  const signature = Buffer.from(await crypto.subtle.sign("Ed25519", keys.privateKey, new TextEncoder().encode(conversionReceiptMessage(result)))).toString("base64")
  const signed = { ...result, receipt: { ...result.receipt, signature } }
  const publicKey = Buffer.from(await crypto.subtle.exportKey("raw", keys.publicKey)).toString("base64")
  expect(await verifyConversionReceipt("source", "output", signed, publicKey)).toBe(true)
  expect(await verifyConversionReceipt("altered source", "output", signed, publicKey)).toBe(false)
  expect(await verifyConversionReceipt("source", "altered output", signed, publicKey)).toBe(false)
  expect(await verifyConversionReceipt("source", "output", { ...signed, state: "diagnostics" }, publicKey)).toBe(false)
  expect(await verifyConversionReceipt("source", "output", { ...signed, effeckVersion: "0.0.2" }, publicKey)).toBe(false)
  expect(await verifyConversionReceipt("source", "output", { ...signed, receipt: { ...signed.receipt, dependenciesDigest: "c".repeat(64) } }, publicKey)).toBe(false)
  expect(await verifyConversionReceipt("source", "output", signed, "invalid key")).toBe(false)
  expect(await verifyConversionReceipt("\ud800", "output", signed, publicKey)).toBe(false)
})

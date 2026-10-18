import { test, expect, type Page } from "@playwright/test"
import { createHash, webcrypto } from "node:crypto"
import { installCloudFixture, runningBox } from "./cloudFixture"

const repo = "smithersai/smithers"
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest()
const unsigned = '{"text":"Ship"}'
const openQuestion = async (page: Page, origin: string) => {
  const answers: any[] = []
  if (origin.includes("localhost")) await page.route(`${origin}/**`, async route => {
    const response = await route.fetch({ url: route.request().url().replace("localhost", "127.0.0.1") })
    await route.fulfill({ response })
  })
  await page.addInitScript('globalThis.__name = (fn) => fn')
  await installCloudFixture(page, { capabilities: ["agent", "identity", "cloud", "cloud.pat"], workspaces: [runningBox(repo)] })
  const json = (body: unknown) => ({ contentType: "application/json", body: JSON.stringify(body) })
  await page.route("**/api/workflow/provision", route => route.fulfill(json({ status: "ready", repo, gatewayId: "gw-1" })))
  await page.route("**/api/workflow/rpc", route => {
    const { procedure, payload } = route.request().postDataJSON()
    if (procedure === "Approval.Submit") {
      answers.push(payload.answer)
      return route.fulfill(json({ ok: true, payload: { decision: { _tag: "Accepted", receiptId: "a" } } }))
    }
    if (procedure === "Projection.Snapshot") {
      const projection = payload.selector._tag
      return route.fulfill(json({ ok: true, payload: { cursor: { projection, runId: null, value: 0 }, rows: projection === "approvals" ? [{
        runId: "run-test", requestId: "question", title: "Sign answer", requestedAt: Date.now(), status: "pending", waitRunId: "wait-execution",
        request: { kind: "json", name: "decision", prompt: "Sign answer", requestId: "question", schema: { type: "object", properties: { text: { type: "string" }, evidence: { type: "object", format: "webauthn-assertion" } } } },
        payload: { target: { _tag: "Node", runId: "run-test", requestId: "question", digest: "sha256:test", envelope: { capabilities: [], flows: [], budget: {} } }, scope: "run", idempotencyKey: "approve:question" }
      }] : [] } }))
    }
    return route.fulfill(json({ ok: true, payload: { _tag: "flows", items: [] } }))
  })
  await page.goto(`${origin}/${repo}`)
  const ask = page.getByRole("button", { name: "Ask", exact: true })
  await expect(ask).toBeVisible()
  if (await ask.getAttribute("aria-expanded") !== "true") await ask.click()
  if (!await page.getByTestId("composer-input").isVisible()) await page.keyboard.press("Control+k")
  await page.getByTestId("composer-input").fill(`/runs ${JSON.stringify({ operation: "approval-list", repo })}`)
  await page.getByTestId("composer-input").press("Enter")
  await page.getByTestId("approval-answer-text").fill(unsigned)
  return answers
}
// Test-only reference verifier, independent of the shipped challenge code.
async function verify(answer: any, privateKey: string, origin: string, expectedText = "Ship", run = "wait-execution", askId = "question") {
  const e = answer.evidence
  const client = Buffer.from(e.clientDataJSON, "base64url")
  const data = JSON.parse(client.toString())
  expect(data.type).toBe("webauthn.get")
  expect(data.origin).toBe(origin)
  expect(data.challenge).toBe(hash(JSON.stringify(["smithers-answer/v1", run, "decision", askId, { text: expectedText }, e.issuedAt])).toString("base64url"))
  const auth = Buffer.from(e.authenticatorData, "base64url")
  expect(auth.subarray(0, 32)).toEqual(hash("localhost"))
  expect(auth[32]! & 5).toBe(5)
  expect(e.kind).toBe("webauthn")
  expect(e.version).toBe("smithers-answer/v1")
  const key = await webcrypto.subtle.importKey("pkcs8", Buffer.from(privateKey, "base64"), { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])
  const jwk = await webcrypto.subtle.exportKey("jwk", key)
  delete jwk.d; jwk.key_ops = ["verify"]
  const publicKey = await webcrypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"])
  // WebAuthn returns ASN.1 DER; WebCrypto accepts fixed-width r || s.
  const der = Buffer.from(e.signature, "base64url")
  const rLength = der[3]!, sOffset = 4 + rLength
  const r = der.subarray(4, sOffset), s = der.subarray(sOffset + 2, sOffset + 2 + der[sOffset + 1]!)
  const raw = Buffer.alloc(64)
  r.subarray(Math.max(0, r.length - 32)).copy(raw, 32 - Math.min(32, r.length))
  s.subarray(Math.max(0, s.length - 32)).copy(raw, 64 - Math.min(32, s.length))
  expect(await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, raw, Buffer.concat([auth, hash(client)]))).toBe(true)
}

test("real passkey assertion binds answer, run and origin", async ({ page, baseURL }) => {
  const origin = baseURL!.replace("127.0.0.1", "localhost")
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("WebAuthn.enable")
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } })
  const answers = await openQuestion(page, origin)
  // Enroll a discoverable ES256 credential on this real origin.
  await page.evaluate(async () => {
    await navigator.credentials.create({ publicKey: { rp: { id: "localhost", name: "Test" }, user: { id: new Uint8Array([1]), name: "test", displayName: "Test" }, challenge: new Uint8Array([1, 2, 3]), pubKeyCredParams: [{ type: "public-key", alg: -7 }], authenticatorSelection: { residentKey: "required", userVerification: "required" } } })
  })
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId })
  await page.getByTestId("approval-answer-send").click()
  await expect.poll(() => answers.length).toBe(1)
  await verify(answers[0], credentials[0]!.privateKey, origin)
  expect(answers[0].text).toBe("Ship")
  await expect(verify(answers[0], credentials[0]!.privateKey, origin, "Changed")).rejects.toThrow()
  await expect(verify(answers[0], credentials[0]!.privateKey, "http://wrong.example")).rejects.toThrow()
  await expect(verify(answers[0], credentials[0]!.privateKey, origin, "Ship", "other-wait")).rejects.toThrow()
  await expect(verify(answers[0], credentials[0]!.privateKey, origin, "Ship", "wait-execution", "next-ask")).rejects.toThrow()
})

test("editing during signing refuses stale assertion and keeps answer", async ({ page, baseURL }) => {
  const origin = baseURL!.replace("127.0.0.1", "localhost")
  const answers = await openQuestion(page, origin)
  await page.evaluate(() => {
    Object.defineProperty(navigator.credentials, "get", { value: () => new Promise(resolve => { (window as any).finishSigning = resolve }) })
  })
  await page.getByTestId("approval-answer-send").click()
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishSigning)).toBe("function")
  await page.getByTestId("approval-answer-text").fill('{"text":"Changed"}')
  await page.evaluate(() => {
    const bytes = new Uint8Array([1]).buffer
    ;(window as any).finishSigning({ rawId: bytes, response: { clientDataJSON: bytes, authenticatorData: bytes, signature: bytes, userHandle: null } })
  })
  await expect(page.getByRole("alert")).toContainText("Answer changed. Sign again.")
  expect(answers).toHaveLength(0)
  await expect(page.getByTestId("approval-answer-text")).toHaveValue('{"text":"Changed"}')
})

test("IP origin refuses signing and sends nothing", async ({ page, baseURL }) => {
  const answers = await openQuestion(page, baseURL!)
  await page.getByTestId("approval-answer-send").click()
  await expect(page.getByRole("alert")).toHaveText(`Signing needs http://localhost:${new URL(baseURL!).port}`)
  expect(answers).toHaveLength(0)
  await expect(page.getByTestId("approval-answer-text")).toHaveValue(unsigned)
})

test("cancelled and failed authenticators preserve the draft without submitting", async ({ page, baseURL }) => {
  const answers = await openQuestion(page, baseURL!.replace("127.0.0.1", "localhost"))
  for (const name of ["NotAllowedError", "UnknownError"]) {
    await page.evaluate(name => {
      Object.defineProperty(navigator.credentials, "get", { configurable: true, value: async () => { throw new DOMException("Authenticator unavailable", name) } })
    }, name)
    await page.getByTestId("approval-answer-send").click()
    await expect(page.getByRole("alert")).toContainText(name === "NotAllowedError" ? "Signing cancelled" : "Authenticator unavailable")
    expect(answers).toHaveLength(0)
    await expect(page.getByTestId("approval-answer-text")).toHaveValue(unsigned)
  }
})

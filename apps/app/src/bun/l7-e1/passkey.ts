// Disposable Chromium WebAuthn proof, not an enrollment in the real Ops vault.
import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
const root = '/tmp/ops-l7-e1-evidence'
const { origin } = JSON.parse(await readFile(`${root}/host.json`, 'utf8'))
const binding = { questionId: 'l7-e1-passkey', runId: 'l7-e1-execution', choice: 'yes', note: '', issuedAt: new Date().toISOString() }
const challenge = createHash('sha256').update(JSON.stringify(['ask-will/v1', binding.questionId, binding.runId, binding.choice, binding.note, binding.issuedAt])).digest('base64url')
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext()
  await context.addInitScript('globalThis.__name = (value) => value')
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } })
  await page.goto(origin)
  const proof = await page.evaluate(async ({ challenge, issuedAt }) => {
    const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
    const bytes = Uint8Array.from(atob(challenge.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0))
    const credential = await navigator.credentials.create({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { id: 'localhost', name: 'L7 disposable' }, user: { id: new Uint8Array([1, 2, 3]), name: 'l7-e1', displayName: 'L7 experiment' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }], authenticatorSelection: { userVerification: 'required' } } }) as PublicKeyCredential
    const registration = credential.response as AuthenticatorAttestationResponse
    const assertion = await navigator.credentials.get({ publicKey: { rpId: 'localhost', challenge: bytes, allowCredentials: [{ type: 'public-key', id: credential.rawId }], userVerification: 'required' } }) as PublicKeyCredential
    const r = assertion.response as AuthenticatorAssertionResponse
    return { key: { id: b64(credential.rawId), publicKeySpki: b64(registration.getPublicKey()!), algorithm: registration.getPublicKeyAlgorithm(), enrolledAt: issuedAt, label: 'E1 virtual only' }, evidence: { kind: 'passkey', issuedAt, credentialId: b64(assertion.rawId), authenticatorData: b64(r.authenticatorData), clientDataJSON: b64(r.clientDataJSON), signature: b64(r.signature) } }
  }, { challenge, issuedAt: binding.issuedAt })
  await mkdir(`${root}/passkeys`, { recursive: true })
  await writeFile(`${root}/passkeys/passkeys.json`, JSON.stringify([proof.key]))
  await writeFile(`${root}/assertion.json`, JSON.stringify({ origin, binding, challenge, ...proof }, null, 2))
  const verification = spawnSync(process.env.HOME + '/.nvm/versions/node/v26.5.0/bin/node', [import.meta.dir + '/verify-passkey.mts'], { cwd: process.env.HOME + '/Smithers-Ops', encoding: 'utf8' })
  await writeFile(`${root}/e1b.json`, verification.stdout)
  if (verification.status !== 0) throw new Error(verification.stderr)
  console.log(verification.stdout)
} finally { await browser.close() }

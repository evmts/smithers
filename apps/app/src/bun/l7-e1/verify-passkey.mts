// Node executes from ~/Smithers-Ops; imports are read-only, keys are temporary.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const ops = process.cwd()
const { challengeFor, verifyAssertion } = await import(pathToFileURL(`${ops}/.smithers/ops/evidence.ts`).href)
const { policy } = await import(pathToFileURL(`${ops}/.smithers/policy.ts`).href)
const root = '/tmp/ops-l7-e1-evidence'
const { evidence, binding, challenge, origin } = JSON.parse(readFileSync(`${root}/assertion.json`, 'utf8'))
if (challengeFor(binding) !== challenge) throw new Error('challenge shape mismatch')
const check = { challenge, notBefore: Date.parse(binding.issuedAt) - 1000, policy, now: new Date(), passkeysDir: `${root}/passkeys` }
const currentPolicy = verifyAssertion(evidence, check)
const allowedOrigin = verifyAssertion(evidence, { ...check, policy: { ...policy, evidence: { ...policy.evidence, origin } } })
const changedChallenge = verifyAssertion(evidence, { ...check, challenge: challengeFor({ ...binding, choice: 'no' }), policy: { ...policy, evidence: { ...policy.evidence, origin } } })
console.log(JSON.stringify({ origin, currentPolicy, allowedOrigin, changedChallenge, changeRequired: `policy.evidence.origin must allow ${origin}; retain rpId localhost` }, null, 2))
if (currentPolicy.ok || !allowedOrigin.ok || changedChallenge.ok) process.exitCode = 1

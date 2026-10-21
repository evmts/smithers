import { Action, Flow } from '@smthrs/flow'
import { Schema } from 'effect'

export const Probe = Action.make('cerebras-load/probe', {
  payload: { id: Schema.Number },
  success: Schema.Void,
  nondeterministic: true
})

export default Flow.make('cerebras-load', {
  description: 'Record one capped provider load-test attempt; provider failures are benchmark observations.',
  capabilities: ['net:post:https://api.cerebras.ai/**', 'net:post:https://api.deepinfra.com/**', 'net:post:https://api.groq.com/**'],
  effects: { reads: [], writes: [], mode: 'expected', onConflict: 'serialize', tier: 'irreversible' },
  modelInvocable: false,
  payload: { id: Schema.Number },
  success: Schema.Void,
  body: payload => Probe.call(payload)
})

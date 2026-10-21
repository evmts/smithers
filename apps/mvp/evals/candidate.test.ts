import { expect, test } from 'vitest'
import { candidateConfig, refusalConfig } from './candidate'
import { providers } from '../bench/cerebras-load/providers'
test('the refusal case keeps the configured provider and replaces only its credential',()=>{
 const record=providers.groq.record
 const config=refusalConfig({CHAT_MODEL:JSON.stringify(record)})
 expect(JSON.parse(config.CHAT_MODEL)).toEqual(record)
 expect(config.SMITHERS_MODEL_KEY_GROQ).toBe('smithers-eval-key-the-provider-rejects')
 expect(config.SMITHERS_MODEL_KEY_GROQ_ORIGIN).toBe('https://api.groq.com')
 expect(config.CEREBRAS_API_KEY).toBeUndefined()
 expect(refusalConfig({}).CEREBRAS_API_KEY).toBe('smithers-eval-key-the-provider-rejects')
})
test('a candidate refuses mismatched origin/model/pricing, missing ledger and absent opt-in',()=>{
 const env={INFERENCE_PROVIDER:'groq',SMITHERS_LIVE_MODEL_TESTS:'1',INFERENCE_LEDGER:'/tmp/campaign.json',CHAT_MODEL:JSON.stringify(providers.groq.record)}
 expect(candidateConfig(env)).toEqual(providers.groq)
 for(const changed of [{SMITHERS_LIVE_MODEL_TESTS:'0'},{INFERENCE_LEDGER:''},{CHAT_MODEL:JSON.stringify({...providers.groq.record,baseUrl:'https://elsewhere.example'})},{CHAT_MODEL:JSON.stringify({...providers.groq.record,modelId:'other-model'})}]) expect(()=>candidateConfig({...env,...changed})).toThrow()
 expect(candidateConfig({})).toBeUndefined()
})

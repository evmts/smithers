/** Reviewed list prices per million tokens, 2026-10-21. No cached-input discount is assumed. */
export const providers = {
  cerebras: { record: { protocol: 'openai-chat', baseUrl: 'https://api.cerebras.ai', modelId: 'qwen-3.8-27b', credential: 'CEREBRAS_API_KEY' }, input: .99, output: 1.49 },
  deepinfra: { record: { protocol: 'openai-chat', baseUrl: 'https://api.deepinfra.com', path: '/v1/openai/chat/completions', modelId: 'Qwen/Qwen3.8-27B', credential: 'DEEPINFRA' }, input: .20, output: 2.50 },
  groq: { record: { protocol: 'openai-chat', baseUrl: 'https://api.groq.com', path: '/openai/v1/chat/completions', modelId: 'qwen/qwen3.8-27b', credential: 'GROQ' }, input: .80, output: 4 },
} as const
export type Provider = keyof typeof providers
export function provider(name = 'cerebras') {
  if (!Object.hasOwn(providers, name)) throw new Error('Unknown benchmark provider')
  return providers[name as Provider]
}
export const estimate = (rate: { input: number; output: number }, input: number, output: number) =>
  (input * rate.input + output * rate.output) / 1e6

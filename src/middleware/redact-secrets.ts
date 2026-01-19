import type { SmithersMiddleware } from './types.js'

export interface RedactSecretsOptions {
  patterns?: RegExp[]
  replacement?: string
}

export function redactSecretsMiddleware(options: RedactSecretsOptions = {}): SmithersMiddleware {
  const patterns = options.patterns ?? [
    /sk-[a-zA-Z0-9]{48}/g,
    /-----BEGIN [A-Z ]+-----[\s\S]+?-----END [A-Z ]+-----/g,
    /[a-zA-Z0-9+/]{40,}={0,2}/g,
  ]
  const replacement = options.replacement ?? '***REDACTED***'

  return {
    name: 'redact-secrets',
    transformChunk: (chunk) => {
      let redacted = chunk
      for (const pattern of patterns) {
        redacted = redacted.replace(pattern, replacement)
      }
      return redacted
    },
  }
}

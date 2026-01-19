import type { SmithersMiddleware } from './types.js'

export interface RedactSecretsOptions {
  patterns?: RegExp[]
  replacement?: string
}

const DEFAULT_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{48}/g,
  /-----BEGIN [A-Z ]+-----[\s\S]+?-----END [A-Z ]+-----/g,
  /[a-zA-Z0-9+/]{40,}={0,2}/g,
]

export function redactSecretsMiddleware(options: RedactSecretsOptions = {}): SmithersMiddleware {
  const patterns = options.patterns ?? DEFAULT_PATTERNS
  const replacement = options.replacement ?? '***REDACTED***'

  const redact = (input: string) => {
    let next = input
    for (const pattern of patterns) {
      next = next.replace(pattern, replacement)
    }
    return next
  }

  return {
    name: 'redact-secrets',
    transformChunk: redact,
    transformResult: (result) => {
      const output = redact(result.output)
      const reasoning = result.reasoning ? redact(result.reasoning) : result.reasoning
      return {
        ...result,
        output,
        reasoning,
      }
    },
  }
}

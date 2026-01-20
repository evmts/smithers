import { describe, test, expect } from 'bun:test'
import type { AgentResult } from '../components/agents/types.js'
import { redactSecretsMiddleware } from './redact-secrets.js'

function makeResult(overrides?: Partial<AgentResult>): AgentResult {
  return {
    output: 'ok',
    structured: undefined,
    tokensUsed: { input: 10, output: 5 },
    turnsUsed: 1,
    stopReason: 'completed',
    durationMs: 100,
    ...overrides,
  }
}

describe('redactSecretsMiddleware', () => {
  describe('transformChunk', () => {
    test('redacts Anthropic API key pattern', () => {
      const middleware = redactSecretsMiddleware()
      // Key with exactly 48 chars after sk- matches the full sk- pattern
      const chunk = 'token sk-123456789012345678901234567890123456789012345678 end'
      const redacted = middleware.transformChunk?.(chunk)

      expect(redacted).toBe('token ***REDACTED*** end')
    })

    test('redacts multiple API keys', () => {
      const middleware = redactSecretsMiddleware()
      // Both keys have exactly 48 chars after sk- (26 letters + 22 digits = 48)
      const chunk =
        'keys: sk-abcdefghijklmnopqrstuvwxyz1234567890123456789012 and sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890123456789012'
      const redacted = middleware.transformChunk?.(chunk)

      expect(redacted).toBe('keys: ***REDACTED*** and ***REDACTED***')
    })

    test('redacts PEM private key blocks', () => {
      const middleware = redactSecretsMiddleware()
      const chunk = `before
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAx4UbaDzY
-----END RSA PRIVATE KEY-----
after`
      const redacted = middleware.transformChunk?.(chunk)

      expect(redacted).toBe('before\n***REDACTED***\nafter')
    })

    test('redacts base64 encoded strings (40+ chars)', () => {
      const middleware = redactSecretsMiddleware()
      const chunk = 'secret: aGVsbG8gd29ybGQgdGhpcyBpcyBhIGxvbmcgYmFzZTY0IHN0cmluZw=='
      const redacted = middleware.transformChunk?.(chunk)

      expect(redacted).toContain('***REDACTED***')
    })

    test('does not redact short strings', () => {
      const middleware = redactSecretsMiddleware()
      const chunk = 'short: abc123'
      const redacted = middleware.transformChunk?.(chunk)

      expect(redacted).toBe('short: abc123')
    })

    test('uses custom replacement text', () => {
      const middleware = redactSecretsMiddleware({ replacement: '[HIDDEN]' })
      // Exactly 48 chars after sk-
      const chunk = 'key: sk-123456789012345678901234567890123456789012345678'
      const redacted = middleware.transformChunk?.(chunk)

      expect(redacted).toBe('key: [HIDDEN]')
    })

    test('uses custom patterns', () => {
      const middleware = redactSecretsMiddleware({
        patterns: [/secret-\d+/g],
      })
      const chunk = 'my secret-12345 and secret-67890'
      const redacted = middleware.transformChunk?.(chunk)

      expect(redacted).toBe('my ***REDACTED*** and ***REDACTED***')
    })

    test('handles text with no secrets', () => {
      const middleware = redactSecretsMiddleware()
      const chunk = 'just normal text without any secrets'
      const redacted = middleware.transformChunk?.(chunk)

      expect(redacted).toBe('just normal text without any secrets')
    })
  })

  describe('transformResult', () => {
    test('redacts secrets in output', () => {
      const middleware = redactSecretsMiddleware()
      const result = middleware.transformResult?.(
        makeResult({
          // Exactly 48 chars after sk-
          output: 'The API key is sk-123456789012345678901234567890123456789012345678.',
        })
      )

      expect(result?.output).toBe('The API key is ***REDACTED***.')
    })

    test('redacts secrets in reasoning', () => {
      const middleware = redactSecretsMiddleware()
      const result = middleware.transformResult?.(
        makeResult({
          output: 'answer',
          // Exactly 48 chars after sk-
          reasoning: 'Found key sk-123456789012345678901234567890123456789012345678',
        })
      )

      expect(result?.reasoning).toBe('Found key ***REDACTED***')
    })

    test('preserves result without reasoning', () => {
      const middleware = redactSecretsMiddleware()
      const result = middleware.transformResult?.(
        makeResult({
          output: 'no reasoning here',
        })
      )

      expect(result?.reasoning).toBeUndefined()
    })

    test('redacts multiple patterns in output', () => {
      const middleware = redactSecretsMiddleware()
      const result = middleware.transformResult?.(
        makeResult({
          // Exactly 48 chars after sk-
          output: `Key: sk-123456789012345678901234567890123456789012345678
-----BEGIN PRIVATE KEY-----
secret
-----END PRIVATE KEY-----`,
        })
      )

      expect(result?.output).toContain('***REDACTED***')
      // Exactly 48 chars after sk- means the full pattern matches
      expect(result?.output).not.toContain('sk-')
      expect(result?.output).not.toContain('BEGIN PRIVATE KEY')
    })

    test('preserves other result properties', () => {
      const middleware = redactSecretsMiddleware()
      const result = middleware.transformResult?.(
        makeResult({
          output: 'clean output',
          structured: { data: 'value' },
          tokensUsed: { input: 100, output: 50 },
          turnsUsed: 3,
          stopReason: 'completed',
          durationMs: 500,
        })
      )

      expect(result?.structured).toEqual({ data: 'value' })
      expect(result?.tokensUsed).toEqual({ input: 100, output: 50 })
      expect(result?.turnsUsed).toBe(3)
      expect(result?.stopReason).toBe('completed')
      expect(result?.durationMs).toBe(500)
    })
  })

  describe('default patterns', () => {
    test('matches sk- pattern with exact length', () => {
      const middleware = redactSecretsMiddleware()

      // Exactly 48 chars after sk- - pattern /sk-[a-zA-Z0-9]{48}/ matches the whole thing
      const valid = 'sk-' + 'a'.repeat(48)
      expect(middleware.transformChunk?.(valid)).toBe('***REDACTED***')

      // 47 chars - sk- pattern won't match, but base64 pattern catches the alphanumeric part
      const short = 'sk-' + 'a'.repeat(47)
      // Base64 pattern [a-zA-Z0-9+/]{40,} matches the 47 'a's, leaving sk-
      expect(middleware.transformChunk?.(short)).toBe('sk-***REDACTED***')
    })

    test('matches PEM certificate blocks', () => {
      const middleware = redactSecretsMiddleware()
      const cert = `-----BEGIN CERTIFICATE-----
MIICpDCCAYwCCQDU+pQ4P3p/JjANBgkqhkiG9w0BAQsFADAU
-----END CERTIFICATE-----`
      const redacted = middleware.transformChunk?.(cert)

      expect(redacted).toBe('***REDACTED***')
    })

    test('matches various PEM block types', () => {
      const middleware = redactSecretsMiddleware()

      const rsaKey = `-----BEGIN RSA PRIVATE KEY-----
data
-----END RSA PRIVATE KEY-----`
      expect(middleware.transformChunk?.(rsaKey)).toBe('***REDACTED***')

      const pubKey = `-----BEGIN PUBLIC KEY-----
data
-----END PUBLIC KEY-----`
      expect(middleware.transformChunk?.(pubKey)).toBe('***REDACTED***')
    })
  })

  describe('edge cases', () => {
    test('handles empty string', () => {
      const middleware = redactSecretsMiddleware()
      expect(middleware.transformChunk?.('')).toBe('')
    })

    test('handles empty output', () => {
      const middleware = redactSecretsMiddleware()
      const result = middleware.transformResult?.(makeResult({ output: '' }))
      expect(result?.output).toBe('')
    })

    test('custom patterns array works correctly', () => {
      const middleware = redactSecretsMiddleware({
        patterns: [/API_KEY=\w+/g, /SECRET=\w+/g],
      })
      const chunk = 'API_KEY=abc123 and SECRET=xyz789'
      const redacted = middleware.transformChunk?.(chunk)

      expect(redacted).toBe('***REDACTED*** and ***REDACTED***')
    })

    test('empty custom patterns does not redact', () => {
      const middleware = redactSecretsMiddleware({
        patterns: [],
      })
      const chunk = 'sk-1234567890123456789012345678901234567890123456'
      const redacted = middleware.transformChunk?.(chunk)

      expect(redacted).toBe(chunk)
    })
  })

  test('has correct middleware name', () => {
    const middleware = redactSecretsMiddleware()
    expect(middleware.name).toBe('redact-secrets')
  })
})

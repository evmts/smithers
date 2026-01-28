/**
 * Tests for errors - pi CLI error detection
 */
import { describe, test, expect } from 'bun:test'
import { PiNotInstalledError, PiAuthError, detectPiError } from './errors.js'

describe('PiNotInstalledError', () => {
  test('has correct code', () => {
    const err = new PiNotInstalledError()
    expect(err.code).toBe('PI_NOT_INSTALLED')
  })

  test('has descriptive message with install command', () => {
    const err = new PiNotInstalledError()
    expect(err.message).toContain('pi CLI not found')
    expect(err.message).toContain('npm i -g')
  })

  test('is instance of Error', () => {
    const err = new PiNotInstalledError()
    expect(err).toBeInstanceOf(Error)
  })
})

describe('PiAuthError', () => {
  test('has correct code', () => {
    const err = new PiAuthError('anthropic', 'Missing key')
    expect(err.code).toBe('PI_AUTH_ERROR')
  })

  test('stores provider', () => {
    const err = new PiAuthError('openai', 'Invalid key')
    expect(err.provider).toBe('openai')
  })

  test('includes provider in message', () => {
    const err = new PiAuthError('google', 'Token expired')
    expect(err.message).toContain('google')
    expect(err.message).toContain('Token expired')
  })
})

describe('detectPiError', () => {
  describe('not installed (exit 127)', () => {
    test('returns PiNotInstalledError for exit code 127', () => {
      const result = detectPiError('', 127)
      
      expect(result).toBeInstanceOf(PiNotInstalledError)
    })

    test('exit 127 takes precedence over stderr content', () => {
      const result = detectPiError('API key error', 127)
      
      expect(result).toBeInstanceOf(PiNotInstalledError)
    })
  })

  describe('auth errors', () => {
    test('detects missing API key', () => {
      const result = detectPiError('Error: ANTHROPIC_API_KEY not set', 1)
      
      expect(result).toBeInstanceOf(PiAuthError)
      expect((result as PiAuthError).provider).toBe('anthropic')
    })

    test('detects generic API key error', () => {
      const result = detectPiError('Invalid API key provided', 1)
      
      expect(result).toBeInstanceOf(PiAuthError)
    })

    test('detects openai provider from stderr', () => {
      const result = detectPiError('openai API key invalid', 1)
      
      expect(result).toBeInstanceOf(PiAuthError)
      expect((result as PiAuthError).provider).toBe('openai')
    })

    test('detects google provider from stderr', () => {
      const result = detectPiError('google API key required', 1)
      
      expect(result).toBeInstanceOf(PiAuthError)
      expect((result as PiAuthError).provider).toBe('google')
    })

    test('detects github-copilot provider from stderr', () => {
      const result = detectPiError('github-copilot API key missing', 1)
      
      expect(result).toBeInstanceOf(PiAuthError)
      expect((result as PiAuthError).provider).toBe('github-copilot')
    })

    test('defaults to unknown provider', () => {
      const result = detectPiError('API key not found', 1)
      
      expect(result).toBeInstanceOf(PiAuthError)
      expect((result as PiAuthError).provider).toBe('unknown')
    })
  })

  describe('OAuth errors', () => {
    test('detects token expired', () => {
      const result = detectPiError('Error: token expired', 1)
      
      expect(result).toBeInstanceOf(PiAuthError)
      expect(result?.message).toContain('/login')
    })

    test('detects refresh failed', () => {
      const result = detectPiError('OAuth refresh failed', 1)
      
      expect(result).toBeInstanceOf(PiAuthError)
    })
  })

  describe('rate limiting', () => {
    test('detects 429 error', () => {
      const result = detectPiError('HTTP 429: Too Many Requests', 1)
      
      expect(result).toBeInstanceOf(Error)
      expect(result?.message).toContain('Rate limited')
    })

    test('detects rate limit message', () => {
      const result = detectPiError('You have exceeded the rate limit', 1)
      
      expect(result).toBeInstanceOf(Error)
      expect(result?.message).toContain('Rate limited')
    })
  })

  describe('no error detected', () => {
    test('returns null for successful exit', () => {
      const result = detectPiError('', 0)
      
      expect(result).toBeNull()
    })

    test('returns null for unknown error patterns', () => {
      const result = detectPiError('Some random error occurred', 1)
      
      expect(result).toBeNull()
    })

    test('returns null for empty stderr with non-zero exit', () => {
      const result = detectPiError('', 1)
      
      expect(result).toBeNull()
    })
  })

  describe('case sensitivity', () => {
    test('matches ANTHROPIC (uppercase)', () => {
      const result = detectPiError('ANTHROPIC_API_KEY missing', 1)
      
      expect(result).toBeInstanceOf(PiAuthError)
      expect((result as PiAuthError).provider).toBe('anthropic')
    })

    test('matches Anthropic (mixed case)', () => {
      const result = detectPiError('Anthropic API key invalid', 1)
      
      expect(result).toBeInstanceOf(PiAuthError)
      expect((result as PiAuthError).provider).toBe('anthropic')
    })
  })
})

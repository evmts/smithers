/**
 * Tests for debug utilities
 *
 * Covers: DebugCollector, event emission, formatting
 */

import { describe, test, expect, spyOn, beforeEach, afterEach } from 'bun:test'
import { createDebugCollector, redactSecrets } from './index.js'
import type { DebugEvent } from '../reconciler/types.js'

describe('createDebugCollector', () => {
  let logSpy: ReturnType<typeof spyOn>
  let errorSpy: ReturnType<typeof spyOn>
  let warnSpy: ReturnType<typeof spyOn>
  let infoSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    logSpy = spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = spyOn(console, 'error').mockImplementation(() => {})
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {})
    infoSpy = spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
    infoSpy.mockRestore()
  })

  describe('collector creation', () => {
    test('returns object with emit function', () => {
      const collector = createDebugCollector()
      expect(collector).toHaveProperty('emit')
      expect(typeof collector.emit).toBe('function')
    })

    test('emit function is callable', () => {
      const collector = createDebugCollector()
      expect(() => collector.emit({ type: 'test' })).not.toThrow()
    })
  })

  describe('event emission', () => {
    test('logs event to console', () => {
      const collector = createDebugCollector()
      collector.emit({ type: 'test-event' })
      expect(logSpy).toHaveBeenCalled()
    })

    test('prefixes output with [Debug]', () => {
      const collector = createDebugCollector()
      collector.emit({ type: 'test-event' })
      expect(logSpy.mock.calls[0][0]).toBe('[Debug]')
    })

    test('includes full event object in log', () => {
      const collector = createDebugCollector()
      const event = { type: 'test-event', data: 'value' }
      collector.emit(event)
      expect(logSpy.mock.calls[0][1]).toEqual(event)
    })
  })

  describe('DebugEvent structure', () => {
    test('handles event with type only', () => {
      const collector = createDebugCollector()
      expect(() => collector.emit({ type: 'simple' })).not.toThrow()
    })

    test('handles event with timestamp', () => {
      const collector = createDebugCollector()
      const event = { type: 'timed', timestamp: Date.now() }
      collector.emit(event)
      expect(logSpy.mock.calls[0][1]).toEqual(event)
    })

    test('handles event with additional properties', () => {
      const collector = createDebugCollector()
      const event = { type: 'extra', foo: 'bar', count: 42 }
      collector.emit(event)
      expect(logSpy.mock.calls[0][1]).toEqual(event)
    })

    test('handles nested object properties', () => {
      const collector = createDebugCollector()
      const event = { type: 'nested', data: { inner: { deep: 'value' } } }
      collector.emit(event)
      expect(logSpy.mock.calls[0][1]).toEqual(event)
    })

    test('handles array properties', () => {
      const collector = createDebugCollector()
      const event = { type: 'array', items: [1, 2, 3] }
      collector.emit(event)
      expect(logSpy.mock.calls[0][1]).toEqual(event)
    })
  })

  describe('console output', () => {
    test('uses console.log for output', () => {
      const collector = createDebugCollector()
      collector.emit({ type: 'test' })
      expect(logSpy).toHaveBeenCalledTimes(1)
    })

    test('handles undefined event properties', () => {
      const collector = createDebugCollector()
      const event = { type: 'undef', value: undefined }
      expect(() => collector.emit(event)).not.toThrow()
    })

    test('handles null event properties', () => {
      const collector = createDebugCollector()
      const event = { type: 'null', value: null }
      collector.emit(event)
      expect(logSpy.mock.calls[0][1]).toEqual(event)
    })
  })

  describe('edge cases', () => {
    test('handles empty event object', () => {
      const collector = createDebugCollector()
      expect(() => collector.emit({ type: '' })).not.toThrow()
    })

    test('handles very large event objects', () => {
      const collector = createDebugCollector()
      const largeData: Record<string, number> = {}
      for (let i = 0; i < 1000; i++) {
        largeData[`key${i}`] = i
      }
      const event = { type: 'large', data: largeData }
      expect(() => collector.emit(event)).not.toThrow()
    })

    test('handles circular references in event', () => {
      const collector = createDebugCollector()
      const circular: Record<string, unknown> = { type: 'circular' }
      circular.self = circular
      expect(() => collector.emit(circular as DebugEvent)).not.toThrow()
      expect(logSpy.mock.calls[0][1]).toHaveProperty('self', '[Circular]')
    })

    test('handles special characters in event properties', () => {
      const collector = createDebugCollector()
      const event = { type: 'special', data: 'hello\nworld\t\r\n' }
      expect(() => collector.emit(event)).not.toThrow()
    })

    test('handles event with many properties', () => {
      const collector = createDebugCollector()
      const event: DebugEvent = { type: 'many' }
      for (let i = 0; i < 100; i++) {
        event[`prop${i}`] = `value${i}`
      }
      expect(() => collector.emit(event)).not.toThrow()
    })
  })

  describe('secret redaction', () => {
    test('does not log API keys in event data', () => {
      const collector = createDebugCollector()
      const event = { type: 'secret', api_key: 'sk-12345' }
      collector.emit(event)
      expect(logSpy.mock.calls[0][1].api_key).toBe('[REDACTED]')
    })

    test('does not log tokens in event data', () => {
      const collector = createDebugCollector()
      const event = { type: 'secret', token: 'bearer-abc123' }
      collector.emit(event)
      expect(logSpy.mock.calls[0][1].token).toBe('[REDACTED]')
    })

    test('does not log passwords in event data', () => {
      const collector = createDebugCollector()
      const event = { type: 'secret', password: 'hunter2' }
      collector.emit(event)
      expect(logSpy.mock.calls[0][1].password).toBe('[REDACTED]')
    })

    test('redacts common secret patterns', () => {
      const collector = createDebugCollector()
      const event = {
        type: 'secret',
        apiKey: 'key1',
        secret: 'key2',
        credential: 'key3',
        auth: 'key4',
        bearer: 'key5',
        private_key: 'key6',
      }
      collector.emit(event)
      const logged = logSpy.mock.calls[0][1]
      expect(logged.apiKey).toBe('[REDACTED]')
      expect(logged.secret).toBe('[REDACTED]')
      expect(logged.credential).toBe('[REDACTED]')
      expect(logged.auth).toBe('[REDACTED]')
      expect(logged.bearer).toBe('[REDACTED]')
      expect(logged.private_key).toBe('[REDACTED]')
    })
  })

  describe('log levels', () => {
    test('supports debug level events', () => {
      const collector = createDebugCollector()
      collector.emit({ type: 'test', level: 'debug' })
      expect(logSpy).toHaveBeenCalled()
    })

    test('supports info level events', () => {
      const collector = createDebugCollector()
      collector.emit({ type: 'test', level: 'info' })
      expect(infoSpy).toHaveBeenCalled()
    })

    test('supports warn level events', () => {
      const collector = createDebugCollector()
      collector.emit({ type: 'test', level: 'warn' })
      expect(warnSpy).toHaveBeenCalled()
    })

    test('supports error level events', () => {
      const collector = createDebugCollector()
      collector.emit({ type: 'test', level: 'error' })
      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('multiple collectors', () => {
    test('independent collectors do not interfere', () => {
      const collector1 = createDebugCollector()
      const collector2 = createDebugCollector()
      collector1.emit({ type: 'from-1' })
      collector2.emit({ type: 'from-2' })
      expect(logSpy).toHaveBeenCalledTimes(2)
      expect(logSpy.mock.calls[0][1]).toEqual({ type: 'from-1' })
      expect(logSpy.mock.calls[1][1]).toEqual({ type: 'from-2' })
    })

    test('each collector has its own emit function', () => {
      const collector1 = createDebugCollector()
      const collector2 = createDebugCollector()
      expect(collector1.emit).not.toBe(collector2.emit)
    })
  })
})

describe('DebugEvent type', () => {
  describe('type property', () => {
    test('accepts string type', () => {
      const event: DebugEvent = { type: 'test-event' }
      expect(event.type).toBe('test-event')
    })

    test('requires type property', () => {
      const event: DebugEvent = { type: 'required' }
      expect(event).toHaveProperty('type')
    })
  })

  describe('timestamp property', () => {
    test('accepts number timestamp', () => {
      const event: DebugEvent = { type: 'test', timestamp: 1234567890 }
      expect(event.timestamp).toBe(1234567890)
    })

    test('timestamp is optional', () => {
      const event: DebugEvent = { type: 'no-timestamp' }
      expect(event.timestamp).toBeUndefined()
    })
  })

  describe('extensibility', () => {
    test('allows additional unknown properties', () => {
      const event: DebugEvent = { type: 'extended', custom: 'value' }
      expect(event.custom).toBe('value')
    })

    test('additional properties can be any type', () => {
      const event: DebugEvent = {
        type: 'multi',
        str: 'string',
        num: 42,
        bool: true,
        obj: { nested: true },
        arr: [1, 2, 3],
      }
      expect(event.str).toBe('string')
      expect(event.num).toBe(42)
      expect(event.bool).toBe(true)
      expect(event.obj).toEqual({ nested: true })
      expect(event.arr).toEqual([1, 2, 3])
    })
  })
})

describe('redactSecrets', () => {
  test('handles null', () => {
    expect(redactSecrets(null)).toBeNull()
  })

  test('handles undefined', () => {
    expect(redactSecrets(undefined)).toBeUndefined()
  })

  test('handles primitives', () => {
    expect(redactSecrets('string')).toBe('string')
    expect(redactSecrets(42)).toBe(42)
    expect(redactSecrets(true)).toBe(true)
  })

  test('redacts nested secrets', () => {
    const input = { data: { nested: { apiKey: 'secret' } } }
    const result = redactSecrets(input) as { data: { nested: { apiKey: string } } }
    expect(result.data.nested.apiKey).toBe('[REDACTED]')
  })
})

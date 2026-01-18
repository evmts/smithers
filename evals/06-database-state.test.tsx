/**
 * Eval 06: Database State KV Operations
 *
 * Tests state module KV operations through the test environment.
 * Validates get/set/setMany/history API, execution_id tracking, and persistence.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestEnvironment, cleanupTestEnvironment, logEvalResult } from './setup'

describe('06-database-state', () => {
  let env: ReturnType<typeof createTestEnvironment>

  beforeEach(() => {
    env = createTestEnvironment('database-state')
  })

  afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 200))
    cleanupTestEnvironment(env)
  })

  test('set and get simple value', async () => {
    const startTime = Date.now()

    env.db.state.set('key', 'value')
    const result = env.db.state.get('key')

    const duration = Date.now() - startTime

    expect(result).toBe('value')

    logEvalResult({
      test: '06-set-get-simple',
      passed: true,
      duration_ms: duration,
      structured_output: {
        key: 'key',
        value: 'value',
        retrieved: result,
      },
      errors: [],
    })
  })

  test('set and get complex object', async () => {
    const startTime = Date.now()

    const obj = {
      name: 'test',
      count: 42,
      nested: {
        enabled: true,
        tags: ['a', 'b', 'c'],
      },
    }

    env.db.state.set('config', obj)
    const result = env.db.state.get('config')

    const duration = Date.now() - startTime

    expect(result).toEqual(obj)

    logEvalResult({
      test: '06-set-get-object',
      passed: true,
      duration_ms: duration,
      structured_output: {
        original: obj,
        retrieved: result,
        matches: JSON.stringify(obj) === JSON.stringify(result),
      },
      errors: [],
    })
  })

  test('setMany updates multiple keys', async () => {
    const startTime = Date.now()

    env.db.state.setMany({
      k1: 'v1',
      k2: 'v2',
      k3: 'v3',
    })

    const v1 = env.db.state.get('k1')
    const v2 = env.db.state.get('k2')
    const v3 = env.db.state.get('k3')

    const duration = Date.now() - startTime

    expect(v1).toBe('v1')
    expect(v2).toBe('v2')
    expect(v3).toBe('v3')

    logEvalResult({
      test: '06-set-many',
      passed: true,
      duration_ms: duration,
      structured_output: {
        keys_set: 3,
        values: { k1: v1, k2: v2, k3: v3 },
      },
      errors: [],
    })
  })

  test('history returns transitions', async () => {
    const startTime = Date.now()

    env.db.state.set('counter', 1)
    env.db.state.set('counter', 2)
    env.db.state.set('counter', 3)

    const history = env.db.state.history('counter')

    const duration = Date.now() - startTime

    expect(Array.isArray(history)).toBe(true)
    expect(history.length).toBe(3)

    logEvalResult({
      test: '06-history-returns-transitions',
      passed: true,
      duration_ms: duration,
      structured_output: {
        transition_count: history.length,
        is_array: Array.isArray(history),
      },
      errors: [],
    })
  })

  test('transitions include execution_id', async () => {
    const startTime = Date.now()

    env.db.state.set('test_key', 'test_value')

    const history = env.db.state.history('test_key')

    const duration = Date.now() - startTime

    expect(history.length).toBeGreaterThan(0)
    expect(history[0]).toHaveProperty('execution_id')
    expect(history[0].execution_id).toBe(env.executionId)

    logEvalResult({
      test: '06-transitions-execution-id',
      passed: true,
      duration_ms: duration,
      structured_output: {
        execution_id: history[0].execution_id,
        matches_env: history[0].execution_id === env.executionId,
      },
      errors: [],
    })
  })

  test('null values handled', async () => {
    const startTime = Date.now()

    env.db.state.set('nullable', null)
    const result = env.db.state.get('nullable')

    const duration = Date.now() - startTime

    expect(result).toBeNull()

    logEvalResult({
      test: '06-null-values',
      passed: true,
      duration_ms: duration,
      structured_output: {
        set_null: true,
        retrieved_null: result === null,
      },
      errors: [],
    })
  })

  test('JSON serialization/deserialization', async () => {
    const startTime = Date.now()

    const complex = {
      string: 'hello',
      number: 123,
      boolean: true,
      null_value: null,
      array: [1, 2, 3],
      nested: {
        deep: {
          value: 'nested',
        },
      },
    }

    env.db.state.set('complex', complex)
    const result = env.db.state.get('complex')

    const duration = Date.now() - startTime

    expect(result).toEqual(complex)
    expect(typeof result).toBe('object')
    expect(result).toHaveProperty('nested')

    logEvalResult({
      test: '06-json-serialization',
      passed: true,
      duration_ms: duration,
      structured_output: {
        serialized_correctly: JSON.stringify(complex) === JSON.stringify(result),
        types_preserved: typeof result === 'object',
      },
      errors: [],
    })
  })

  test('state persists across queries', async () => {
    const startTime = Date.now()

    // First section - set values
    env.db.state.set('persistent_key', 'persistent_value')
    env.db.state.setMany({
      a: 1,
      b: 2,
      c: 3,
    })

    // Simulate query boundary - values should persist
    const v1 = env.db.state.get('persistent_key')
    const v2 = env.db.state.get('a')
    const v3 = env.db.state.get('b')
    const v4 = env.db.state.get('c')

    const duration = Date.now() - startTime

    expect(v1).toBe('persistent_value')
    expect(v2).toBe(1)
    expect(v3).toBe(2)
    expect(v4).toBe(3)

    logEvalResult({
      test: '06-state-persistence',
      passed: true,
      duration_ms: duration,
      structured_output: {
        all_values_persisted: v1 === 'persistent_value' && v2 === 1 && v3 === 2 && v4 === 3,
        values: { persistent_key: v1, a: v2, b: v3, c: v4 },
      },
      errors: [],
    })
  })
})

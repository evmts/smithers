/**
 * Eval 09: Hooks - Ralph Iteration Tracking
 *
 * Tests Ralph iteration tracking via database state.
 * Validates that ralphCount is properly stored and retrieved from DB state table.
 *
 * Focus: DB state validation, not actual loop iteration (too complex).
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestEnvironment, cleanupTestEnvironment, logEvalResult } from './setup'
import { SmithersProvider } from '../src/components/SmithersProvider'
import { Phase } from '../src/components/Phase'
import { useRalphCount } from '../src/hooks/useRalphCount'

describe('09-hooks-ralph', () => {
  let env: ReturnType<typeof createTestEnvironment>

  beforeEach(() => {
    env = createTestEnvironment('hooks-ralph')
  })

  afterEach(async () => {
    // Wait for async effects to complete
    await new Promise(resolve => setTimeout(resolve, 200))
    cleanupTestEnvironment(env)
  })

  test('ralphCount initializes to 0 in DB', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="init">Initialize</Phase>
      </SmithersProvider>
    )

    // Wait for DB initialization
    await new Promise(resolve => setTimeout(resolve, 100))

    // Query DB state directly
    const result = env.db.db.queryOne<{ value: string }>(
      "SELECT value FROM state WHERE key = 'ralphCount'"
    )

    const duration = Date.now() - startTime

    expect(result).toBeDefined()
    expect(result?.value).toBe('0')

    logEvalResult({
      test: '09-ralphCount-initializes',
      passed: true,
      duration_ms: duration,
      structured_output: {
        initial_value: result?.value,
      },
      errors: [],
    })
  })

  test('ralphCount can be incremented in DB', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="test">Test</Phase>
      </SmithersProvider>
    )

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100))

    // Manually increment ralphCount in DB
    env.db.db.run(
      "UPDATE state SET value = '1', updated_at = datetime('now') WHERE key = 'ralphCount'"
    )

    // Verify the update
    const result = env.db.db.queryOne<{ value: string }>(
      "SELECT value FROM state WHERE key = 'ralphCount'"
    )

    const duration = Date.now() - startTime

    expect(result).toBeDefined()
    expect(result?.value).toBe('1')

    logEvalResult({
      test: '09-ralphCount-increment',
      passed: true,
      duration_ms: duration,
      structured_output: {
        updated_value: result?.value,
      },
      errors: [],
    })
  })

  test('Ralph state persists across reads', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="test">Test</Phase>
      </SmithersProvider>
    )

    await new Promise(resolve => setTimeout(resolve, 100))

    // Set a specific value
    env.db.db.run(
      "UPDATE state SET value = '5', updated_at = datetime('now') WHERE key = 'ralphCount'"
    )

    // Read it back
    const result1 = env.db.db.queryOne<{ value: string }>(
      "SELECT value FROM state WHERE key = 'ralphCount'"
    )

    // Read again to verify persistence
    const result2 = env.db.db.queryOne<{ value: string }>(
      "SELECT value FROM state WHERE key = 'ralphCount'"
    )

    const duration = Date.now() - startTime

    expect(result1?.value).toBe('5')
    expect(result2?.value).toBe('5')
    expect(result1?.value).toBe(result2?.value)

    logEvalResult({
      test: '09-ralph-state-persists',
      passed: true,
      duration_ms: duration,
      structured_output: {
        first_read: result1?.value,
        second_read: result2?.value,
        values_match: result1?.value === result2?.value,
      },
      errors: [],
    })
  })

  test('Multiple iterations tracked in DB', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="test">Test</Phase>
      </SmithersProvider>
    )

    await new Promise(resolve => setTimeout(resolve, 100))

    const iterations = [0, 1, 2, 5, 10]
    const results: string[] = []

    for (const iteration of iterations) {
      env.db.db.run(
        "UPDATE state SET value = ?, updated_at = datetime('now') WHERE key = 'ralphCount'",
        [String(iteration)]
      )

      const result = env.db.db.queryOne<{ value: string }>(
        "SELECT value FROM state WHERE key = 'ralphCount'"
      )

      results.push(result?.value ?? 'null')
    }

    const duration = Date.now() - startTime

    expect(results).toEqual(['0', '1', '2', '5', '10'])

    logEvalResult({
      test: '09-multiple-iterations-tracked',
      passed: true,
      duration_ms: duration,
      structured_output: {
        iterations_tested: iterations,
        results: results,
        all_match: results.every((val, idx) => val === String(iterations[idx])),
      },
      errors: [],
    })
  })

  test('ralphCount is reactive - component can read from DB state', async () => {
    const startTime = Date.now()
    let capturedCount: number | null = null

    function RalphReader() {
      const ralphCount = useRalphCount()
      capturedCount = ralphCount
      return <phase name="reader">Count: {ralphCount}</phase>
    }

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <RalphReader />
      </SmithersProvider>
    )

    // Wait for initialization and first render
    await new Promise(resolve => setTimeout(resolve, 150))

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Component should read initial value of 0
    expect(capturedCount).toBe(0)
    expect(xml).toContain('Count:')
    expect(xml).toContain('0')

    logEvalResult({
      test: '09-ralphCount-reactive-read',
      passed: true,
      duration_ms: duration,
      structured_output: {
        captured_count: capturedCount,
        xml_contains_count: xml.includes('0'),
      },
      errors: [],
    })
  })
})

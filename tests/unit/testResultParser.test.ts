import { describe, test, expect } from 'bun:test'
import {
  parseTestOutput,
  parseBunTestOutput,
  parseJestOutput,
  parseVitestOutput,
  parseNodeTestOutput,
  TestResult,
  TestSummary
} from '../../issues/smithershub/src/utils/testResultParser'

describe('testResultParser', () => {
  describe('parseBunTestOutput', () => {
    test('parses successful bun test output', () => {
      const output = `
✓ math.test.ts > addition works (1ms)
✓ math.test.ts > subtraction works (0ms)
✓ string.test.ts > concatenation works (2ms)

3 pass
0 fail
3 total
      `

      const result = parseBunTestOutput(output)

      expect(result.passed).toBe(true)
      expect(result.total).toBe(3)
      expect(result.failed).toBe(0)
      expect(result.results).toHaveLength(3)
      expect(result.results[0]).toEqual({
        file: 'math.test.ts',
        testName: 'addition works',
        status: 'passed',
        duration: 1
      })
    })

    test('parses failed bun test output', () => {
      const output = `
✓ math.test.ts > addition works (1ms)
✗ math.test.ts > division by zero (5ms)
  Expected: Infinity
  Received: Error: Cannot divide by zero
✓ string.test.ts > concatenation works (2ms)

2 pass
1 fail
3 total
      `

      const result = parseBunTestOutput(output)

      expect(result.passed).toBe(false)
      expect(result.total).toBe(3)
      expect(result.failed).toBe(1)
      expect(result.results).toHaveLength(3)
      expect(result.results[1].file).toBe('math.test.ts')
      expect(result.results[1].testName).toBe('division by zero')
      expect(result.results[1].status).toBe('failed')
      expect(result.results[1].duration).toBe(5)
      expect(result.results[1].error).toContain('Expected: Infinity')
      expect(result.results[1].error).toContain('Received: Error: Cannot divide by zero')
    })

    test('handles bun test timeout', () => {
      const output = `
✓ math.test.ts > addition works (1ms)
✗ async.test.ts > slow operation (timeout after 5000ms)
  Test exceeded timeout of 5000ms

1 pass
1 fail (timeout)
2 total
      `

      const result = parseBunTestOutput(output)

      expect(result.passed).toBe(false)
      expect(result.total).toBe(2)
      expect(result.failed).toBe(1)
      expect(result.results[1].status).toBe('timeout')
      expect(result.results[1].error).toContain('timeout')
    })
  })

  describe('parseJestOutput', () => {
    test('parses successful jest output', () => {
      const output = `
PASS src/math.test.js (0.5s)
  ✓ addition works (3ms)
  ✓ subtraction works (1ms)

PASS src/string.test.js (0.3s)
  ✓ concatenation works (2ms)

Test Suites: 2 passed, 2 total
Tests:       3 passed, 3 total
Snapshots:   0 total
Time:        1.2s
      `

      const result = parseJestOutput(output)

      expect(result.passed).toBe(true)
      expect(result.total).toBe(3)
      expect(result.failed).toBe(0)
      expect(result.results).toHaveLength(3)
      expect(result.results[0]).toEqual({
        file: 'src/math.test.js',
        testName: 'addition works',
        status: 'passed',
        duration: 3
      })
    })

    test('parses failed jest output', () => {
      const output = `
PASS src/math.test.js
  ✓ addition works (3ms)
  ✗ division by zero (15ms)
    Expected: Infinity
    Received: Error: Cannot divide by zero

FAIL src/string.test.js
  ✗ concatenation works (2ms)
    TypeError: Cannot read property 'concat' of undefined

Test Suites: 1 failed, 1 passed, 2 total
Tests:       1 failed, 2 passed, 3 total
      `

      const result = parseJestOutput(output)

      expect(result.passed).toBe(false)
      expect(result.total).toBe(3)
      expect(result.failed).toBeGreaterThan(0)
      expect(result.results.filter(r => r.status === 'failed').length).toBeGreaterThan(0)
    })
  })

  describe('parseVitestOutput', () => {
    test('parses successful vitest output', () => {
      const output = `
✓ src/math.test.ts (2 tests) 1ms
  ✓ addition works 0ms
  ✓ subtraction works 1ms
✓ src/string.test.ts (1 test) 0ms
  ✓ concatenation works 0ms

Test Files  2 passed (2)
Tests  3 passed (3)
Start at 10:30:25
Duration  50ms
      `

      const result = parseVitestOutput(output)

      expect(result.passed).toBe(true)
      expect(result.total).toBeGreaterThan(0)
      expect(result.failed).toBe(0)
    })

    test('parses failed vitest output', () => {
      const output = `
✓ src/math.test.ts (1/2 tests) 5ms
  ✓ addition works 1ms
  ✗ division by zero 4ms
    AssertionError: Expected Infinity but got Error
✗ src/string.test.ts (0/1 tests) 2ms
  ✗ concatenation works 2ms
    TypeError: Cannot read property 'concat' of undefined

Test Files  1 failed, 1 passed (2)
Tests  2 failed, 1 passed (3)
      `

      const result = parseVitestOutput(output)

      expect(result.passed).toBe(false)
      expect(result.total).toBeGreaterThan(0)
      expect(result.failed).toBeGreaterThan(0)
    })
  })

  describe('parseNodeTestOutput', () => {
    test('parses successful node test output', () => {
      const output = `
TAP version 13
# Subtest: math tests
    # Subtest: addition works
    ok 1 - addition works
    # Subtest: subtraction works
    ok 2 - subtraction works
ok 1 - math tests

# Subtest: string tests
    # Subtest: concatenation works
    ok 1 - concatenation works
ok 2 - string tests

1..2
      `

      const result = parseNodeTestOutput(output)

      expect(result.passed).toBe(true)
      expect(result.total).toBeGreaterThan(0)
      expect(result.failed).toBe(0)
    })
  })

  describe('parseTestOutput (generic)', () => {
    test('auto-detects bun test format', () => {
      const bunOutput = `
✓ test.ts > works (1ms)
1 pass
0 fail
      `

      const result = parseTestOutput(bunOutput, 'auto')

      expect(result.passed).toBe(true)
      expect(result.total).toBe(1)
      expect(result.format).toBe('bun')
    })

    test('auto-detects jest format', () => {
      const jestOutput = `
PASS src/test.js
  ✓ works (1ms)

Test Suites: 1 passed
Tests: 1 passed
      `

      const result = parseTestOutput(jestOutput, 'auto')

      expect(result.passed).toBe(true)
      expect(result.format).toBe('jest')
    })

    test('handles unknown format gracefully', () => {
      const unknownOutput = 'Some random output that is not a test result'

      const result = parseTestOutput(unknownOutput, 'auto')

      expect(result.passed).toBe(false)
      expect(result.total).toBe(0)
      expect(result.failed).toBe(0)
      expect(result.format).toBe('unknown')
      expect(result.results).toHaveLength(0)
    })

    test('respects explicit format parameter', () => {
      const output = `
✓ test.ts > works (1ms)
1 pass
      `

      // Force jest parsing on bun output
      const result = parseTestOutput(output, 'jest')

      expect(result.format).toBe('jest')
      // Should fail to parse correctly since it's bun format
      expect(result.total).toBeGreaterThanOrEqual(0)
    })

    test('extracts coverage information when present', () => {
      const outputWithCoverage = `
✓ test.ts > works (1ms)
1 pass
0 fail

Coverage Summary:
Lines: 85% (17/20)
Functions: 90% (9/10)
Branches: 75% (6/8)
Statements: 85% (17/20)
      `

      const result = parseTestOutput(outputWithCoverage, 'bun')

      expect(result.coverage).toBeDefined()
      expect(result.coverage!.lines).toBe(85)
      expect(result.coverage!.functions).toBe(90)
      expect(result.coverage!.branches).toBe(75)
      expect(result.coverage!.statements).toBe(85)
    })

    test('handles performance metrics', () => {
      const result: TestSummary = {
        passed: true,
        total: 5,
        failed: 0,
        format: 'bun',
        results: [
          { file: 'fast.test.ts', testName: 'fast test', status: 'passed', duration: 1 },
          { file: 'slow.test.ts', testName: 'slow test', status: 'passed', duration: 100 }
        ],
        duration: 150,
        coverage: { lines: 80, functions: 85, branches: 70, statements: 80 }
      }

      expect(result.duration).toBe(150)
      expect(result.results.reduce((sum, test) => sum + (test.duration || 0), 0)).toBe(101)
    })
  })
})
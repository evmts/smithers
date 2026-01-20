import { describe, test, expect } from 'bun:test'
import { parseCoverage, formatCoverage } from './utils.js'

describe('parseCoverage', () => {
  test('parses "All files" coverage line', () => {
    const output = `
src/foo.ts | 100.00 | 95.00 |
src/bar.ts |  50.00 | 45.00 |
All files  |  89.23 | 88.75 |

5191 pass
14 skip
0 fail
`
    const result = parseCoverage(output)
    expect(result.functionCoverage).toBe(89.23)
    expect(result.lineCoverage).toBe(88.75)
    expect(result.passed).toBe(5191)
    expect(result.skipped).toBe(14)
    expect(result.failed).toBe(0)
  })

  test('returns zeros for empty output', () => {
    const result = parseCoverage('')
    expect(result.functionCoverage).toBe(0)
    expect(result.lineCoverage).toBe(0)
    expect(result.passed).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.failed).toBe(0)
  })

  test('handles real bun test output format', () => {
    const output = `All files                                             |   89.23 |   88.75 |

 5191 pass
 14 skip
 0 fail`
    const result = parseCoverage(output)
    expect(result.functionCoverage).toBe(89.23)
    expect(result.lineCoverage).toBe(88.75)
  })
})

describe('formatCoverage', () => {
  test('formats coverage result', () => {
    const result = {
      functionCoverage: 89.23,
      lineCoverage: 88.75,
      passed: 100,
      failed: 2,
      skipped: 5,
    }
    expect(formatCoverage(result)).toBe(
      'Functions: 89.23% | Lines: 88.75% | Tests: 100 pass, 2 fail, 5 skip'
    )
  })
})

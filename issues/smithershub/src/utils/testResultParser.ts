/**
 * Test result parser utility - parses output from various test runners
 * Supports Bun, Jest, Vitest, and Node.js native test runner
 */

export interface TestResult {
  file: string
  testName: string
  status: 'passed' | 'failed' | 'skipped' | 'timeout'
  duration?: number // milliseconds
  error?: string
}

export interface TestCoverage {
  lines: number
  functions: number
  branches: number
  statements: number
}

export interface TestSummary {
  passed: boolean
  total: number
  failed: number
  skipped?: number
  format: 'bun' | 'jest' | 'vitest' | 'node' | 'unknown'
  results: TestResult[]
  duration?: number
  coverage?: TestCoverage
}

/**
 * Parse test output from various test runners
 */
export function parseTestOutput(output: string, format: 'auto' | 'bun' | 'jest' | 'vitest' | 'node' = 'auto'): TestSummary {
  if (format === 'auto') {
    format = detectFormat(output)
  }

  switch (format) {
    case 'bun':
      return parseBunTestOutput(output)
    case 'jest':
      return parseJestOutput(output)
    case 'vitest':
      return parseVitestOutput(output)
    case 'node':
      return parseNodeTestOutput(output)
    default:
      return {
        passed: false,
        total: 0,
        failed: 0,
        format: 'unknown',
        results: []
      }
  }
}

/**
 * Auto-detect test runner format from output
 */
function detectFormat(output: string): 'bun' | 'jest' | 'vitest' | 'node' | 'unknown' {
  // Check for Jest first (PASS/FAIL indicates Jest)
  if (output.includes('PASS') || output.includes('FAIL')) {
    return 'jest'
  }

  // Check for Node.js TAP format
  if (output.includes('TAP version') || output.includes('# Subtest:')) {
    return 'node'
  }

  // Check for Vitest (has specific output patterns)
  if (output.includes('Test Files') && output.includes('Duration')) {
    return 'vitest'
  }

  // Check for Bun (has ✓ and pass/fail but not PASS/FAIL)
  if (output.includes('✓') && (output.includes('pass') || output.includes('fail'))) {
    return 'bun'
  }

  return 'unknown'
}

/**
 * Parse Bun test output
 */
export function parseBunTestOutput(output: string): TestSummary {
  const results: TestResult[] = []
  const lines = output.split('\n')

  let total = 0
  let failed = 0
  let passed = 0

  for (const line of lines) {
    const trimmed = line.trim()

    // Parse individual test results
    const testMatch = trimmed.match(/^(✓|✗)\s+(.+?)\s+>\s+(.+?)\s+\((\d+)ms\)/)
    if (testMatch) {
      const [, status, file, testName, duration] = testMatch
      results.push({
        file,
        testName,
        status: status === '✓' ? 'passed' : 'failed',
        duration: parseInt(duration, 10)
      })
      continue
    }

    // Parse timeout cases
    const timeoutMatch = trimmed.match(/^✗\s+(.+?)\s+>\s+(.+?)\s+\(timeout after (\d+)ms\)/)
    if (timeoutMatch) {
      const [, file, testName, timeout] = timeoutMatch
      results.push({
        file,
        testName,
        status: 'timeout',
        duration: parseInt(timeout, 10),
        error: `Test exceeded timeout of ${timeout}ms`
      })
      continue
    }

    // Parse error details (next lines after failed test)
    const errorMatch = trimmed.match(/^(Expected:|Received:|Error:)/)
    if (errorMatch && results.length > 0) {
      const lastResult = results[results.length - 1]
      if (lastResult.status === 'failed' || lastResult.status === 'timeout') {
        lastResult.error = lastResult.error ? `${lastResult.error}\n${trimmed}` : trimmed
      }
      continue
    }

    // Handle multi-line error messages that start with whitespace
    if (trimmed.length > 0 && line.startsWith('  ') && results.length > 0) {
      const lastResult = results[results.length - 1]
      if (lastResult.status === 'failed' || lastResult.status === 'timeout') {
        lastResult.error = lastResult.error ? `${lastResult.error}\n${trimmed}` : trimmed
      }
      continue
    }

    // Parse summary
    if (trimmed.match(/^\d+\s+pass/)) {
      passed = parseInt(trimmed.match(/^(\d+)\s+pass/)![1], 10)
    }
    if (trimmed.match(/^\d+\s+fail/)) {
      failed = parseInt(trimmed.match(/^(\d+)\s+fail/)![1], 10)
    }
    if (trimmed.match(/^\d+\s+total/)) {
      total = parseInt(trimmed.match(/^(\d+)\s+total/)![1], 10)
    }
  }

  const coverage = extractCoverage(output)

  // If no totals found, calculate from results
  if (total === 0 && results.length > 0) {
    total = results.length
    passed = results.filter(r => r.status === 'passed').length
    failed = results.filter(r => r.status === 'failed' || r.status === 'timeout').length
  }

  return {
    passed: failed === 0 && total > 0,
    total: total || results.length,
    failed: failed || results.filter(r => r.status === 'failed' || r.status === 'timeout').length,
    format: 'bun',
    results,
    coverage
  }
}

/**
 * Parse Jest test output
 */
export function parseJestOutput(output: string): TestSummary {
  const results: TestResult[] = []
  const lines = output.split('\n')

  let currentFile = ''
  let total = 0
  let failed = 0

  for (const line of lines) {
    const trimmed = line.trim()

    // Parse file headers
    const fileMatch = trimmed.match(/^(PASS|FAIL)\s+(.+?)\s*(?:\([\d.]+s\))?$/)
    if (fileMatch) {
      currentFile = fileMatch[2]
      continue
    }

    // Parse individual test results
    const testMatch = trimmed.match(/^(✓|✗)\s+(.+?)\s+\((\d+)ms\)/)
    if (testMatch) {
      const [, status, testName, duration] = testMatch
      results.push({
        file: currentFile,
        testName,
        status: status === '✓' ? 'passed' : 'failed',
        duration: parseInt(duration, 10)
      })
      continue
    }

    // Parse error details
    if (currentFile && (trimmed.startsWith('Expected:') || trimmed.startsWith('Received:') || trimmed.includes('Error:') || trimmed.includes('TypeError:'))) {
      const lastResult = results[results.length - 1]
      if (lastResult && lastResult.status === 'failed') {
        lastResult.error = lastResult.error ? `${lastResult.error}\n${trimmed}` : trimmed
      }
      continue
    }

    // Handle multi-line error messages with indentation
    if (currentFile && line.startsWith('    ') && results.length > 0) {
      const lastResult = results[results.length - 1]
      if (lastResult && lastResult.status === 'failed') {
        lastResult.error = lastResult.error ? `${lastResult.error}\n${trimmed}` : trimmed
      }
      continue
    }

    // Parse summary
    const summaryMatch = trimmed.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/)
    if (summaryMatch) {
      failed = parseInt(summaryMatch[1], 10)
      total = parseInt(summaryMatch[3], 10)
      continue
    }

    const passOnlyMatch = trimmed.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/)
    if (passOnlyMatch) {
      failed = 0
      total = parseInt(passOnlyMatch[2], 10)
      continue
    }
  }

  const coverage = extractCoverage(output)

  // If no totals found, calculate from results
  if (total === 0 && results.length > 0) {
    total = results.length
    failed = results.filter(r => r.status === 'failed').length
  }

  return {
    passed: failed === 0 && total > 0,
    total: total || results.length,
    failed: failed || results.filter(r => r.status === 'failed').length,
    format: 'jest',
    results,
    coverage
  }
}

/**
 * Parse Vitest output
 */
export function parseVitestOutput(output: string): TestSummary {
  const results: TestResult[] = []
  const lines = output.split('\n')

  let total = 0
  let failed = 0

  for (const line of lines) {
    const trimmed = line.trim()

    // Parse file results
    const fileMatch = trimmed.match(/^(✓|✗)\s+(.+?)\s+\((\d+)(?:\/(\d+))?\s+tests?\)\s+(\d+)ms/)
    if (fileMatch) {
      const [, status, file, passed, totalInFile, duration] = fileMatch
      // Individual test results would be on following lines, but we'll create summary entries
      const passedCount = parseInt(passed, 10)
      const totalInFileCount = totalInFile ? parseInt(totalInFile, 10) : passedCount

      // Create placeholder results for the file
      for (let i = 0; i < passedCount; i++) {
        results.push({
          file,
          testName: `test ${i + 1}`,
          status: 'passed',
          duration: parseInt(duration, 10) / totalInFileCount
        })
      }

      const failedInFile = totalInFileCount - passedCount
      for (let i = 0; i < failedInFile; i++) {
        results.push({
          file,
          testName: `test ${passedCount + i + 1}`,
          status: 'failed',
          duration: parseInt(duration, 10) / totalInFileCount
        })
      }
      continue
    }

    // Parse individual test results (when detailed)
    const testMatch = trimmed.match(/^(✓|✗)\s+(.+?)\s+(\d+)ms/)
    if (testMatch && !trimmed.includes('(')) {
      const [, status, testName, duration] = testMatch
      results.push({
        file: 'unknown', // Would need to track current file
        testName,
        status: status === '✓' ? 'passed' : 'failed',
        duration: parseInt(duration, 10)
      })
      continue
    }

    // Parse summary
    const summaryMatch = trimmed.match(/Tests\s+(\d+)\s+failed,\s+(\d+)\s+passed\s+\((\d+)\)/)
    if (summaryMatch) {
      failed = parseInt(summaryMatch[1], 10)
      total = parseInt(summaryMatch[3], 10)
      continue
    }

    const passOnlyMatch = trimmed.match(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/)
    if (passOnlyMatch) {
      failed = 0
      total = parseInt(passOnlyMatch[2], 10)
      continue
    }
  }

  const coverage = extractCoverage(output)

  return {
    passed: failed === 0 && total > 0,
    total: total || results.length,
    failed: failed || results.filter(r => r.status === 'failed').length,
    format: 'vitest',
    results,
    coverage
  }
}

/**
 * Parse Node.js native test runner output (TAP format)
 */
export function parseNodeTestOutput(output: string): TestSummary {
  const results: TestResult[] = []
  const lines = output.split('\n')

  let currentSuite = ''

  for (const line of lines) {
    const trimmed = line.trim()

    // Parse test suites
    const suiteMatch = trimmed.match(/^# Subtest: (.+)/)
    if (suiteMatch) {
      currentSuite = suiteMatch[1]
      continue
    }

    // Parse individual tests
    const testMatch = trimmed.match(/^(ok|not ok)\s+(\d+)\s+-\s+(.+)/)
    if (testMatch) {
      const [, status, , testName] = testMatch
      results.push({
        file: currentSuite,
        testName,
        status: status === 'ok' ? 'passed' : 'failed'
      })
      continue
    }
  }

  const totalTests = results.length
  const failedTests = results.filter(r => r.status === 'failed').length

  return {
    passed: failedTests === 0 && totalTests > 0,
    total: totalTests,
    failed: failedTests,
    format: 'node',
    results
  }
}

/**
 * Extract coverage information from test output
 */
function extractCoverage(output: string): TestCoverage | undefined {
  const coverageMatch = output.match(/Coverage Summary:\s*\n(?:.*\n)*?Lines:\s+(\d+)%.*\n.*Functions:\s+(\d+)%.*\n.*Branches:\s+(\d+)%.*\n.*Statements:\s+(\d+)%/s)

  if (coverageMatch) {
    return {
      lines: parseInt(coverageMatch[1], 10),
      functions: parseInt(coverageMatch[2], 10),
      branches: parseInt(coverageMatch[3], 10),
      statements: parseInt(coverageMatch[4], 10)
    }
  }

  // Alternative coverage format
  const altCoverageMatch = output.match(/Lines:\s+(\d+)%.*Functions:\s+(\d+)%.*Branches:\s+(\d+)%.*Statements:\s+(\d+)%/s)
  if (altCoverageMatch) {
    return {
      lines: parseInt(altCoverageMatch[1], 10),
      functions: parseInt(altCoverageMatch[2], 10),
      branches: parseInt(altCoverageMatch[3], 10),
      statements: parseInt(altCoverageMatch[4], 10)
    }
  }

  return undefined
}
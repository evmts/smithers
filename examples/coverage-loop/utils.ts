/**
 * Coverage parsing utilities
 */

export interface CoverageResult {
  functionCoverage: number
  lineCoverage: number
  passed: number
  failed: number
  skipped: number
}

/**
 * Parse coverage output from `bun test --coverage`
 * Extracts the "All files" summary line
 */
export function parseCoverage(output: string): CoverageResult {
  // Find "All files" line: "All files | 89.23 | 88.75 |"
  const allFilesMatch = output.match(/All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/)

  // Find test results: "5191 pass" "14 skip" "0 fail"
  const passMatch = output.match(/(\d+)\s+pass/)
  const skipMatch = output.match(/(\d+)\s+skip/)
  const failMatch = output.match(/(\d+)\s+fail/)

  return {
    functionCoverage: allFilesMatch ? parseFloat(allFilesMatch[1]) : 0,
    lineCoverage: allFilesMatch ? parseFloat(allFilesMatch[2]) : 0,
    passed: passMatch ? parseInt(passMatch[1], 10) : 0,
    failed: failMatch ? parseInt(failMatch[1], 10) : 0,
    skipped: skipMatch ? parseInt(skipMatch[1], 10) : 0,
  }
}

/**
 * Format coverage result for display
 */
export function formatCoverage(result: CoverageResult): string {
  return `Functions: ${result.functionCoverage.toFixed(2)}% | Lines: ${result.lineCoverage.toFixed(2)}% | Tests: ${result.passed} pass, ${result.failed} fail, ${result.skipped} skip`
}

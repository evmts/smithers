/**
 * CoverageLoop - While-based loop for test coverage improvement
 * 
 * Uses SQLite for all state management (no useRef).
 * Coverage metrics stored in db.state, reactive via useQueryValue.
 */

import type { ReactNode } from 'react'
import { While, useWhileIteration } from '../../src/components/While.js'
import { useSmithers } from '../../src/components/SmithersProvider.js'
import { Claude } from '../../src/components/Claude.js'
import { useQueryValue } from '../../src/db/index.js'
import { parseCoverage, formatCoverage } from './utils.js'

interface CoverageLoopProps {
  targetCoverage: number
  maxIterations: number
}

const COVERAGE_PROMPT = `Improve test coverage for this codebase.

<task>
1. Run \`bun test --coverage\` to measure current coverage
2. Find files with lowest coverage (uncovered lines in output)
3. Prioritize:
   - Core business logic
   - Utility functions lacking edge cases
   - Uncovered error paths
4. For each file, add comprehensive tests:
   - Happy path
   - Edge cases (empty, null, max)
   - Error handling
5. Atomic commits: \`<emoji> <type>(<scope>): <description>\`
</task>

<constraints>
- Only add tests, no implementation changes
- Run \`bun test\` after each change
- 2-3 test additions per iteration max
</constraints>

<report>
- Files improved (before/after coverage)
- New test count
- Skipped files needing coverage
</report>`

export function CoverageLoop({ targetCoverage, maxIterations }: CoverageLoopProps): ReactNode {
  const { db, reactiveDb } = useSmithers()

  const currentCoverage = useQueryValue<number>(
    reactiveDb,
    "SELECT CAST(value AS REAL) FROM state WHERE key = 'coverage.current'"
  ) ?? 0

  const checkCount = useQueryValue<number>(
    reactiveDb,
    "SELECT CAST(value AS INTEGER) FROM state WHERE key = 'coverage.checkCount'"
  ) ?? 0

  const checkCoverage = async (): Promise<boolean> => {
    const proc = Bun.spawn(['bun', 'test', '--coverage'], {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: process.cwd(),
    })
    const output = await new Response(proc.stdout).text()
    await proc.exited

    const result = parseCoverage(output)
    const minCoverage = Math.min(result.functionCoverage, result.lineCoverage)
    const newCheckCount = checkCount + 1

    db.state.set('coverage.current', minCoverage, 'coverage_check')
    db.state.set('coverage.target', targetCoverage, 'coverage_check')
    db.state.set('coverage.checkCount', newCheckCount, 'coverage_check')
    db.state.set('coverage.functionCoverage', result.functionCoverage, 'coverage_check')
    db.state.set('coverage.lineCoverage', result.lineCoverage, 'coverage_check')
    db.state.set('coverage.passed', result.passed, 'coverage_check')
    db.state.set('coverage.failed', result.failed, 'coverage_check')

    console.log(`[Check #${newCheckCount}] ${formatCoverage(result)}`)

    return minCoverage < targetCoverage
  }

  return (
    <coverage-loop target={targetCoverage} max={maxIterations} current={currentCoverage}>
      <While
        id="coverage-improvement"
        condition={checkCoverage}
        maxIterations={maxIterations}
        onIteration={(i) => console.log(`\n=== Iteration ${i + 1} ===`)}
        onComplete={(iterations, reason) => {
          console.log(`\n=== Complete: ${iterations} iterations, ${reason} ===`)
          console.log(`Final coverage: ${currentCoverage.toFixed(2)}%`)
        }}
      >
        <CoverageIteration />
      </While>
    </coverage-loop>
  )
}

function CoverageIteration(): ReactNode {
  const ctx = useWhileIteration()
  const { db } = useSmithers()

  const handleComplete = () => {
    const completed = db.state.get<boolean>(`iteration.${ctx?.iteration}.completed`)
    if (!completed) {
      db.state.set(`iteration.${ctx?.iteration}.completed`, true, 'iteration_complete')
      ctx?.signalComplete()
    }
  }

  return (
    <iteration index={ctx?.iteration ?? 0}>
      <Claude
        model="sonnet"
        permissionMode="acceptEdits"
        maxTurns={50}
        onFinished={handleComplete}
        onError={(err) => {
          console.error('Agent error:', err.message)
          db.state.set(`iteration.${ctx?.iteration}.error`, err.message, 'iteration_error')
          handleComplete()
        }}
      >
        {COVERAGE_PROMPT}
      </Claude>
    </iteration>
  )
}

export type { CoverageLoopProps }

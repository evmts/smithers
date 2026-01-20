/**
 * CoverageLoop - While-based loop for test coverage improvement
 */

import type { ReactNode } from 'react'
import { useRef } from 'react'
import { While, useWhileIteration } from '../../src/components/While.js'
import { useSmithers } from '../../src/components/SmithersProvider.js'
import { Claude } from '../../src/components/Claude.js'
import { useMount } from '../../src/reconciler/hooks.js'
import { parseCoverage, formatCoverage, type CoverageResult } from './utils.js'

interface CoverageLoopProps {
  targetCoverage: number
  maxIterations: number
}

const COVERAGE_PROMPT = `Review this codebase for test coverage and identify missing tests.

<task>
1. Run \`bun test --coverage\` to see current coverage
2. Identify files with lowest coverage (look for uncovered line numbers in output)
3. Find highest leverage opportunities - focus on:
   - Core business logic with low coverage
   - Utility functions lacking edge case tests
   - Error handling paths not exercised
4. When adding tests for an API, be comprehensive:
   - Happy path cases
   - Boundary conditions (empty, null, max values)
   - Error cases (invalid input, network failures)
   - Edge cases specific to the domain
5. Make atomic commits with emoji conventional format:
   - \`bun test\` must pass before committing
   - Pre-commit hooks must pass
   - Format: \`<emoji> <type>(<scope>): <description>\`
</task>

<constraints>
- Only add tests, do not modify implementation code
- Each commit should be focused on one file or closely related files
- Run \`bun test\` after each change to verify tests pass
- Stop after making 2-3 meaningful test additions per iteration
</constraints>

<report>
After completing, report:
- Files improved with before/after coverage
- Number of new test cases added
- Any files that need more coverage but were skipped
</report>`

export function CoverageLoop(props: CoverageLoopProps): ReactNode {
  const { targetCoverage, maxIterations } = props
  const { db } = useSmithers()
  const coverageRef = useRef<CoverageResult | null>(null)
  const checkIdRef = useRef(0)

  const checkCoverage = async (): Promise<boolean> => {
    const proc = Bun.spawn(['bun', 'test', '--coverage'], {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: process.cwd(), // Use current working directory
    })
    const output = await new Response(proc.stdout).text()
    await proc.exited

    const result = parseCoverage(output)
    coverageRef.current = result
    checkIdRef.current += 1

    const currentCoverage = Math.min(result.functionCoverage, result.lineCoverage)
    console.log(`[Coverage Check #${checkIdRef.current}] ${formatCoverage(result)}`)

    // Store in state for visibility
    db.state.set('coverage.current', currentCoverage, 'coverage_check')
    db.state.set('coverage.target', targetCoverage, 'coverage_check')

    // Continue while coverage is below target
    return currentCoverage < targetCoverage
  }

  return (
    <coverage-loop target={targetCoverage} maxIterations={maxIterations}>
      <While
        id="coverage-improvement"
        condition={checkCoverage}
        maxIterations={maxIterations}
        onIteration={(i) => console.log(`\n=== Coverage Iteration ${i + 1} ===`)}
        onComplete={(iterations, reason) => {
          console.log(`\n=== Coverage Loop Complete ===`)
          console.log(`Iterations: ${iterations}, Reason: ${reason}`)
          if (coverageRef.current) {
            console.log(`Final: ${formatCoverage(coverageRef.current)}`)
          }
        }}
      >
        <CoverageIteration />
      </While>
    </coverage-loop>
  )
}

function CoverageIteration(): ReactNode {
  const ctx = useWhileIteration()
  const completedRef = useRef(false)

  return (
    <iteration index={ctx?.iteration ?? 0}>
      <Claude
        model="sonnet"
        permissionMode="acceptEdits"
        maxTurns={50}
        onFinished={() => {
          if (!completedRef.current) {
            completedRef.current = true
            ctx?.signalComplete()
          }
        }}
        onError={(err) => {
          console.error('Agent error:', err.message)
          if (!completedRef.current) {
            completedRef.current = true
            ctx?.signalComplete()
          }
        }}
      >
        {COVERAGE_PROMPT}
      </Claude>
    </iteration>
  )
}

export type { CoverageLoopProps }

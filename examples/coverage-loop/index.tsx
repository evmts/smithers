/**
 * Coverage Loop - Simple RALPH loop for test coverage improvement
 *
 * Runs until test coverage exceeds target threshold (default 98%).
 * Each iteration:
 * 1. Runs `bun test --coverage` to measure current coverage
 * 2. If below threshold, spawns Claude agent to add missing tests
 * 3. Agent makes atomic conventional commits
 * 4. Loop continues until target reached or max iterations hit
 */

import { SmithersProvider } from '../../src/components/SmithersProvider.js'
import { createSmithersDB } from '../../src/db/index.js'
import { createSmithersRoot } from '../../src/reconciler/index.js'
import { CoverageLoop } from './CoverageLoop.js'

export interface CoverageLoopOptions {
  targetCoverage?: number  // Default: 98
  maxIterations?: number   // Default: 20
}

export async function runCoverageLoop(options: CoverageLoopOptions = {}): Promise<void> {
  const { targetCoverage = 98, maxIterations = 20 } = options
  const db = createSmithersDB({ path: ':memory:' })

  const executionId = db.execution.start('coverage-loop', 'examples/coverage-loop/index.tsx')
  const root = createSmithersRoot()

  await root.mount(() => (
    <SmithersProvider db={db} executionId={executionId} maxIterations={maxIterations}>
      <orchestration name="coverage-loop">
        <CoverageLoop targetCoverage={targetCoverage} maxIterations={maxIterations} />
      </orchestration>
    </SmithersProvider>
  ))

  console.log('\n=== Coverage Loop Complete ===')
  console.log(root.toXML())

  db.execution.complete(executionId)
  db.close()
}

if (import.meta.main) {
  const targetCoverage = parseInt(process.env.TARGET_COVERAGE ?? '98', 10)
  const maxIterations = parseInt(process.env.MAX_ITERATIONS ?? '20', 10)
  runCoverageLoop({ targetCoverage, maxIterations }).catch(console.error)
}

export { CoverageLoop } from './CoverageLoop.js'
export { parseCoverage, type CoverageResult } from './utils.js'

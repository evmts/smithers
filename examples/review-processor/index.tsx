#!/usr/bin/env bun
/**
 * Review Processor - Parallel Review Implementation Workflow
 *
 * Processes all reviews in reviews/ directory:
 * - Phase 1: Scan - Read all reviews, categorize by difficulty
 * - Phase 2: Parallel - Deploy 16 subagents to process non-difficult reviews
 * - Phase 3: Serial - Process difficult reviews one at a time
 * - Phase 4: Report - Generate summary of processed reviews
 *
 * Key patterns:
 * - Parallel subagent execution with concurrency limit
 * - Retry handling for failed agents
 * - Deferred processing for difficult reviews
 * - Git commit without bypassing precommit hooks
 */

import { SmithersProvider } from '../../src/components/SmithersProvider.js'
import { createSmithersDB } from '../../src/db/index.js'
import { createSmithersRoot } from '../../src/reconciler/index.js'
import { ReviewProcessor } from './ReviewProcessor.js'

export interface ReviewProcessorConfig {
  maxParallel: number
  reviewsDir: string
  cwd: string
}

export async function runReviewProcessor(config: ReviewProcessorConfig = {
  maxParallel: 16,
  reviewsDir: 'reviews',
  cwd: process.cwd(),
}): Promise<void> {
  const db = createSmithersDB({ path: ':memory:' })
  const executionId = db.execution.start('review-processor', 'examples/review-processor/index.tsx')

  console.log('\n' + '='.repeat(70))
  console.log('Review Processor Workflow')
  console.log('='.repeat(70))
  console.log(`Max parallel agents: ${config.maxParallel}`)
  console.log(`Reviews directory: ${config.reviewsDir}`)
  console.log('='.repeat(70) + '\n')

  const root = createSmithersRoot()

  await root.mount(() => (
    <SmithersProvider db={db} executionId={executionId} maxIterations={100}>
      <orchestration name="review-processor">
        <ReviewProcessor
          maxParallel={config.maxParallel}
          reviewsDir={config.reviewsDir}
        />
      </orchestration>
    </SmithersProvider>
  ))

  console.log('\n' + '='.repeat(70))
  console.log('Review Processing Complete')
  console.log('='.repeat(70))
  console.log('\nFinal State:')
  console.log(root.toXML())

  db.execution.complete(executionId)
  db.close()
}

if (import.meta.main) {
  runReviewProcessor().catch(console.error)
}

export { ReviewProcessor } from './ReviewProcessor.js'
export { ScanPhase } from './components/ScanPhase.js'
export { ParallelProcessPhase } from './components/ParallelProcessPhase.js'
export { SerialProcessPhase } from './components/SerialProcessPhase.js'
export { ReportPhase } from './components/ReportPhase.js'
export type * from './types.js'

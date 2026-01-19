/**
 * ParallelProcessPhase - Process reviews with parallel subagents
 * 
 * Spawns up to maxParallel agents to process reviews concurrently.
 * Handles retries for failed agents.
 */

import type { ReactNode } from 'react'
import { Parallel } from '../../../src/components/Parallel.js'
import { Subagent } from '../../../src/components/Subagent.js'
import { Step } from '../../../src/components/Step.js'
import { Claude } from '../../../src/components/Claude.js'
import type { ReviewInfo } from '../types.js'

export interface ParallelProcessPhaseProps {
  reviews: ReviewInfo[]
  maxParallel: number
  stateKey: string
}

export function ParallelProcessPhase({ reviews, maxParallel }: ParallelProcessPhaseProps): ReactNode {
  // Only process pending reviews
  const pending = reviews.filter(r => r.status === 'pending')
  
  if (pending.length === 0) {
    return <parallel-status>No pending reviews to process</parallel-status>
  }

  // Batch into chunks of maxParallel
  const batch = pending.slice(0, maxParallel)

  return (
    <parallel-processing active={batch.length} total={pending.length}>
      <Parallel>
        {batch.map(review => (
          <ReviewAgent key={review.name} review={review} />
        ))}
      </Parallel>
    </parallel-processing>
  )
}

interface ReviewAgentProps {
  review: ReviewInfo
}

function ReviewAgent({ review }: ReviewAgentProps): ReactNode {
  return (
    <Subagent name={`review-${review.name}`} parallel>
      <Step name={`Process ${review.name}`}>
        <Claude>
          {`Process review: ${review.name}

<review-content>
${review.content}
</review-content>

<instructions>
1. Read the review carefully
2. Determine if the issue is already fixed or needs implementation
3. If ALREADY FIXED: Close the review by deleting the file
4. If NEEDS IMPLEMENTATION: Implement the fix, then delete the review file

IMPORTANT:
- Keep commits atomic and focused
- If implementation fails, report the error clearly
 - Do not bypass precommit hooks

Report your action: implemented | closed | failed
</instructions>`}
        </Claude>
      </Step>
    </Subagent>
  )
}

/**
 * SerialProcessPhase - Process difficult reviews one at a time
 * 
 * These are processed after all parallel work completes.
 * Serial processing allows for more careful handling.
 */

import type { ReactNode } from 'react'
import { Step } from '../../../src/components/Step.js'
import { Claude } from '../../../src/components/Claude.js'
import { If } from '../../../src/components/If.js'
import type { ReviewInfo } from '../types.js'

export interface SerialProcessPhaseProps {
  reviews: ReviewInfo[]
  stateKey: string
}

export function SerialProcessPhase({ reviews }: SerialProcessPhaseProps): ReactNode {
  const pending = reviews.filter(r => r.status === 'pending')

  if (pending.length === 0) {
    return <serial-status>No difficult reviews to process</serial-status>
  }

  return (
    <serial-processing total={pending.length}>
      {pending.map((review, idx) => (
        <Step key={review.name} name={`Difficult Review ${idx + 1}/${pending.length}: ${review.name}`}>
          <If condition={review.status === 'pending'}>
            <Claude>
              {`Process DIFFICULT review: ${review.name}

<review-content>
${review.content}
</review-content>

<instructions>
This review is marked as difficult. Take extra care:

1. Analyze the review thoroughly before making changes
2. If already implemented, verify with tests before closing
3. If needs implementation:
   - Plan the approach first
   - Make incremental commits
   - Run tests after each significant change
   - Do not bypass precommit hooks

4. If you cannot complete it, document what you tried and why it failed

Report: implemented | closed | failed (with reason)
</instructions>`}
            </Claude>
          </If>
        </Step>
      ))}
    </serial-processing>
  )
}

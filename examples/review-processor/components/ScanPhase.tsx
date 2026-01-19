/**
 * ScanPhase - Display scan results
 */

import type { ReactNode } from 'react'
import type { ReviewInfo } from '../types.js'

export interface ScanPhaseProps {
  reviews: ReviewInfo[]
}

export function ScanPhase({ reviews }: ScanPhaseProps): ReactNode {
  const normal = reviews.filter(r => !r.isDifficult)
  const difficult = reviews.filter(r => r.isDifficult)

  return (
    <scan-results>
      <summary>
        Found {reviews.length} reviews: {normal.length} normal, {difficult.length} difficult
      </summary>
      <normal-reviews count={normal.length}>
        {normal.slice(0, 5).map(r => r.name).join(', ')}
        {normal.length > 5 ? ` ... and ${normal.length - 5} more` : ''}
      </normal-reviews>
      <difficult-reviews count={difficult.length}>
        {difficult.map(r => r.name).join(', ')}
      </difficult-reviews>
    </scan-results>
  )
}

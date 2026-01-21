import type { ReactNode } from 'react'
import { useReview } from '../../hooks/useReview.js'
import type { ReviewProps } from './types.js'

/**
 * Review component - reviews code changes using AI
 */
export function Review(props: ReviewProps): ReactNode {
  const { status, result, error } = useReview(props)

  return (
    <review
      status={status}
      approved={result?.approved}
      summary={result?.summary}
      issue-count={result?.issues.length}
      error={error?.message}
      target-type={props.target.type}
      target-ref={props.target.ref}
      blocking={props.blocking}
    />
  )
}

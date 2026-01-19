/**
 * ReviewPhase - Self-review and handle GH review comments
 * 
 * Two responsibilities:
 * 1. Agent reviews its own code for quality/issues
 * 2. Fetches and addresses any GH review comments
 */

import type { ReactNode } from 'react'
import { Step } from '../../../src/components/Step.js'
import { If } from '../../../src/components/If.js'
import { Each } from '../../../src/components/Each.js'
import { Claude } from '../../../src/components/Claude.js'
import type { PRInfo, PRReview, WorktreeContext } from '../types.js'

export interface ReviewPhaseProps {
  worktree: WorktreeContext
  pr: PRInfo
  reviewsHandled: boolean
  onReviewsHandled?: () => void
}

export function ReviewPhase({
  worktree,
  pr,
  reviewsHandled,
  onReviewsHandled,
}: ReviewPhaseProps): ReactNode {
  const pendingReviews = pr.reviews.filter(
    (r) => r.state === 'CHANGES_REQUESTED' || r.state === 'COMMENTED'
  )
  const hasChangesRequested = pr.reviews.some((r) => r.state === 'CHANGES_REQUESTED')

  return (
    <phase-content name="review">
      <context>
        <pr number={pr.number} review-decision={pr.reviewDecision} />
        <reviews count={pr.reviews.length} pending={pendingReviews.length} />
      </context>

      {/* Step 1: Self-review */}
      <Step name="self-review">
        <Claude model="sonnet">
          Self-review the code changes in PR #{pr.number}:

          1. Run `git diff origin/main...HEAD` to see all changes
          2. Check for:
             - Code quality issues
             - Missing error handling
             - Type safety problems
             - Test coverage gaps
             - Security concerns
             - Performance issues
          3. Fix any issues found
          4. If no issues, confirm code is ready

          Working directory: {worktree.path}
        </Claude>
      </Step>

      {/* Step 2: Handle GH reviews */}
      <If condition={pendingReviews.length > 0 && !reviewsHandled}>
        <pending-reviews>
          <Each items={pendingReviews}>
            {(review: PRReview) => (
              <review
                key={`${review.author}-${review.submittedAt}`}
                author={review.author}
                state={review.state}
              >
                {review.body}
              </review>
            )}
          </Each>
        </pending-reviews>

        <Step name="address-reviews">
          <Claude model="sonnet">
            Address PR review comments for PR #{pr.number}:

            Reviews requiring action:
            {pendingReviews
              .map((r) => `\n## ${r.author} (${r.state}):\n${r.body}`)
              .join('\n')}

            For each comment:
            1. Understand what the reviewer is asking for
            2. Make the requested changes if valid
            3. If you disagree, prepare a response explaining why
            4. After addressing all comments, reply to each thread

            Use gh cli to reply to review comments:
            `gh pr review {pr.number} --comment -b "response"`
          </Claude>
        </Step>
      </If>

      <If condition={hasChangesRequested && !reviewsHandled}>
        <Step name="request-re-review">
          <task type="shell">
            After addressing changes, request re-review:
            `gh pr edit {pr.number} --add-reviewer [original reviewers]`
          </task>
        </Step>
      </If>

      <If condition={reviewsHandled || pendingReviews.length === 0}>
        <status>All reviews addressed</status>
      </If>
    </phase-content>
  )
}

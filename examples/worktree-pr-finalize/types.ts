/**
 * Types for Worktree PR Finalize Workflow
 */

export interface WorktreeContext {
  name: string
  path: string
  branch: string
}

export interface PRInfo {
  number: number
  title: string
  headRefName: string
  baseRefName: string
  state: string
  mergeable: boolean
  mergeStateStatus: string
  reviewDecision: string | null
  statusCheckRollup: CheckStatus[]
  reviews: PRReview[]
}

export interface CheckStatus {
  name: string
  status: 'PENDING' | 'COMPLETED'
  conclusion: 'SUCCESS' | 'FAILURE' | 'NEUTRAL' | 'SKIPPED' | null
}

export interface PRReview {
  author: string
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING'
  body: string
  submittedAt: string
}

export interface StackedPRInfo {
  isStacked: boolean
  basePR?: {
    number: number
    title: string
    branch: string
    merged: boolean
  }
}

export type PhaseStatus = 'pending' | 'running' | 'complete' | 'failed' | 'skipped'

export interface WorktreeFinalizeState {
  phase: 'init' | 'stack-check' | 'rebase' | 'review' | 'push' | 'poll' | 'merge' | 'done'
  pr: PRInfo | null
  stacked: StackedPRInfo | null
  rebaseResult: RebaseResult | null
  reviewsHandled: boolean
  pushResult: PushResult | null
  mergeResult: MergeResult | null
  error: string | null
}

export interface RebaseResult {
  success: boolean
  beforeSha: string
  afterSha: string
  conflictFiles?: string[]
  error?: string
}

export interface PushResult {
  success: boolean
  sha: string
  error?: string
}

export interface MergeResult {
  success: boolean
  method: 'merge' | 'squash' | 'rebase'
  sha?: string
  error?: string
}

export interface WorktreeAgentReport {
  worktree: string
  prNumber: number | null
  status: 'merged' | 'failed' | 'skipped'
  phases: {
    stackCheck: PhaseStatus
    rebase: PhaseStatus
    review: PhaseStatus
    push: PhaseStatus
    poll: PhaseStatus
    merge: PhaseStatus
  }
  error?: string
  mergedSha?: string
}

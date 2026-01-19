/**
 * Types for Stacked PR Merge Workflow
 */

export interface WorktreeInfo {
  name: string
  branch: string
  path: string
  hasPR: boolean
  prNumber?: number | undefined
  prTitle?: string | undefined
  buildPasses: boolean
  testsPassing: boolean
  mergeCandidate: boolean
}

export interface PRInfo {
  number: number
  title: string
  headRefName: string
  baseRefName: string
  updatedAt: string
  additions: number
  deletions: number
  changedFiles: number
}

export interface MergeCandidate {
  worktree: WorktreeInfo
  pr: PRInfo
  priority: number
  dependencies: string[]
}

export interface MergeResult {
  name: string
  success: boolean
  commitSha?: string
  error?: string
}

export interface StackedMergeState {
  candidates: MergeCandidate[]
  mergeOrder: string[]
  completed: MergeResult[]
  current: string | null
}

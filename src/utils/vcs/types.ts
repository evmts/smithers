// Shared type definitions for VCS operations

/**
 * Status result for both git and jj
 */
export interface VCSStatus {
  modified: string[]
  added: string[]
  deleted: string[]
  untracked?: string[]
}

/**
 * Diff statistics result
 */
export interface DiffStats {
  files: string[]
  insertions: number
  deletions: number
}

/**
 * Commit info result
 */
export interface CommitInfo {
  hash: string
  author: string
  message: string
}

/**
 * Command execution result
 */
export interface CommandResult {
  stdout: string
  stderr: string
}

/**
 * JJ snapshot result
 */
export interface JJSnapshotResult {
  changeId: string
  description: string
}

/**
 * JJ commit result
 */
export interface JJCommitResult {
  commitHash: string
  changeId: string
}

/**
 * Git worktree info
 */
export interface WorktreeInfo {
  /** Absolute path to the worktree directory */
  path: string
  /** Branch name (null for detached HEAD) */
  branch: string | null
  /** Commit hash at HEAD */
  head: string
  /** Whether the worktree is locked */
  locked?: boolean
  /** Whether the worktree can be pruned */
  prunable?: boolean
}

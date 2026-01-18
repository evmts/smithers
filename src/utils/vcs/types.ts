// Shared type definitions for VCS operations

/**
 * Status result for both git and jj
 */
export interface VCSStatus {
  modified: string[]
  added: string[]
  deleted: string[]
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

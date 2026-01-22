export interface VCSStatus {
  modified: string[]
  added: string[]
  deleted: string[]
  untracked?: string[]
}

export interface DiffStats {
  files: string[]
  insertions: number
  deletions: number
}

export interface CommitInfo {
  hash: string
  author: string
  message: string
}

export interface CommandResult {
  stdout: string
  stderr: string
}

export interface JJSnapshotResult {
  changeId: string
  description: string
}

export interface JJCommitResult {
  commitHash: string
  changeId: string
}

export interface WorktreeInfo {
  path: string
  branch: string | null
  head: string
  locked?: boolean
  prunable?: boolean
}

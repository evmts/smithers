// VCS utilities barrel export
// Re-exports all VCS functionality for convenient imports

// Types
export type {
  VCSStatus,
  DiffStats,
  CommitInfo,
  CommandResult,
  JJSnapshotResult,
  JJCommitResult,
} from './types'

// Parsers
export { parseGitStatus, parseJJStatus, parseDiffStats } from './parsers'

// Git operations
export {
  git,
  getCommitHash,
  getCommitInfo,
  getDiffStats,
  getGitStatus,
  addGitNotes,
  getGitNotes,
  hasGitNotes,
  isGitRepo,
  getCurrentBranch,
} from './git'

// Jujutsu operations
export {
  jj,
  getJJChangeId,
  jjSnapshot,
  jjCommit,
  getJJStatus,
  getJJDiffStats,
  isJJRepo,
} from './jj'

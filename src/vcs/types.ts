/**
 * Types and interfaces for JJ snapshot system
 * Provides comprehensive VCS integration for agent tool calls
 */

/**
 * Represents a JJ snapshot - a point-in-time capture of repository state
 */
export interface JJSnapshot {
  /** Unique identifier for this snapshot */
  id: string

  /** JJ change ID that represents this snapshot */
  changeId: string

  /** Human-readable description of the snapshot */
  description: string

  /** When this snapshot was created */
  timestamp: Date

  /** Parent change ID if this snapshot has a parent */
  parentChangeId?: string

  /** Files affected in this snapshot */
  files: {
    modified: string[]
    added: string[]
    deleted: string[]
  }

  /** Whether this snapshot has unresolved conflicts */
  hasConflicts: boolean

  /** Whether this snapshot represents an empty change */
  isEmpty: boolean

  /** Bookmarks/branches associated with this snapshot */
  bookmarks?: string[]
}

/**
 * Detailed information about a JJ changeset
 */
export interface ChangesetInfo {
  /** Full JJ change ID */
  changeId: string

  /** Short form of change ID for display */
  shortId: string

  /** Commit message/description */
  description: string

  /** Author information */
  author: string

  /** When this changeset was created */
  timestamp: Date

  /** Whether this changeset is empty (no file changes) */
  isEmpty: boolean

  /** Whether this changeset has unresolved conflicts */
  hasConflicts: boolean

  /** Parent change IDs */
  parentIds: string[]

  /** Associated bookmarks */
  bookmarks?: string[]

  /** File changes in this changeset */
  files: {
    modified: string[]
    added: string[]
    deleted: string[]
  }

  /** Corresponding Git commit hash if available */
  commitHash?: string
}

/**
 * Current state of the repository
 */
export interface RepoState {
  /** Whether the repository is in a clean state */
  isClean: boolean

  /** Current change ID */
  currentChangeId: string

  /** Working copy change ID */
  workingCopyChangeId?: string

  /** Current bookmarks/branches */
  bookmarks: string[]

  /** Whether there are uncommitted changes */
  hasUncommittedChanges: boolean

  /** Files with unresolved conflicts */
  conflictedFiles: string[]

  /** Untracked files in working directory */
  untrackedFiles: string[]

  /** Modified but not committed files */
  modifiedFiles: string[]

  /** Files staged for commit (JJ doesn't stage, but for compatibility) */
  stagedFiles: string[]

  /** Current branch name (for Git compatibility) */
  branch?: string
}

/**
 * Options for creating snapshots
 */
export interface SnapshotOptions {
  /** Custom description for the snapshot */
  description?: string

  /** Whether to include untracked files */
  includeUntracked?: boolean

  /** Create a bookmark/branch for this snapshot */
  createBookmark?: string

  /** Skip creating snapshot if no changes detected */
  skipEmptyCommits?: boolean

  /** Automatically cleanup old snapshots after creation */
  autoCleanup?: boolean

  /** Verify repository is in clean state before snapshot */
  verifyCleanState?: boolean
}

/**
 * Options for rollback operations
 */
export interface RollbackOptions {
  /** Preserve existing bookmarks during rollback */
  preserveBookmarks?: boolean

  /** Clean up intermediate changes between current and target */
  cleanupIntermediate?: boolean

  /** Force rollback even if conflicts exist */
  force?: boolean
}

/**
 * Options for cleanup operations
 */
export interface CleanupOptions {
  /** Maximum number of snapshots to keep */
  maxSnapshots?: number

  /** Maximum age of snapshots in days */
  maxAgeInDays?: number

  /** Only clean up empty snapshots */
  emptyOnly?: boolean

  /** Dry run - show what would be cleaned but don't do it */
  dryRun?: boolean
}

/**
 * Context information for tool calls
 */
export interface SnapshotContext {
  /** Execution ID from the agent system */
  executionId: string

  /** Agent ID making the tool call */
  agentId: string

  /** Task ID if available */
  taskId?: string

  /** Name of the tool being called */
  toolName: string

  /** Custom snapshot ID if specified */
  snapshotId?: string

  /** Additional metadata */
  metadata?: Record<string, any>
}

/**
 * Result of a wrapped tool call
 */
export interface ToolCallResult<T = any> {
  /** Whether the tool call succeeded */
  success: boolean

  /** Result from the tool call if successful */
  result?: T

  /** Error message if the tool call failed */
  error?: string

  /** Snapshot taken before the tool call */
  snapshotBefore?: JJSnapshot

  /** Snapshot taken after the tool call (if successful) */
  snapshotAfter?: JJSnapshot

  /** Whether rollback was performed */
  rolledBack?: boolean
}

/**
 * Interface for managing JJ changesets
 */
export interface ChangesetManager {
  /** Create a new changeset */
  createChangeset(description?: string): Promise<string>

  /** Get information about current changeset */
  getCurrentChangeset(): Promise<ChangesetInfo | null>

  /** Get information about a specific changeset */
  getChangeset(changeId: string): Promise<ChangesetInfo | null>

  /** List recent changesets */
  listChangesets(limit?: number): Promise<ChangesetInfo[]>

  /** Move to a specific changeset */
  editChangeset(changeId: string): Promise<void>

  /** Abandon a changeset */
  abandonChangeset(changeId: string): Promise<void>

  /** Squash a changeset into another */
  squashChangeset(sourceChangeId: string, targetChangeId?: string): Promise<void>

  /** Update changeset description */
  describeChangeset(changeId: string | undefined, description: string): Promise<void>

  /** Get file changes for a changeset */
  getChangesetFiles(changeId: string): Promise<{
    modified: string[]
    added: string[]
    deleted: string[]
  }>

  /** Create a bookmark */
  createBookmark(name: string, changeId?: string): Promise<void>

  /** Delete a bookmark */
  deleteBookmark(name: string): Promise<void>
}

/**
 * Interface for repository cleaning and verification
 */
export interface RepoCleaner {
  /** Verify repository is in clean state */
  verifyCleanState(): Promise<boolean>

  /** Get current repository state */
  getRepoState(): Promise<RepoState>

  /** Clean repository to pristine state */
  cleanRepository(options?: { removeUntracked?: boolean }): Promise<void>

  /** Rollback to a specific snapshot or change */
  rollback(target: JJSnapshot | string, options?: RollbackOptions): Promise<void>

  /** Create a restore point before potentially destructive operations */
  createRestorePoint(description?: string): Promise<string>

  /** Validate repository integrity */
  validateRepository(): Promise<boolean>

  /** Get list of untracked files */
  getUntrackedFiles(): Promise<string[]>

  /** Remove untracked files */
  removeUntrackedFiles(files?: string[]): Promise<void>
}

/**
 * Main JJ snapshot system interface
 */
export interface JJSnapshotSystem {
  /** Create a new snapshot */
  createSnapshot(options?: SnapshotOptions): Promise<JJSnapshot>

  /** Get a specific snapshot */
  getSnapshot(changeId: string): Promise<JJSnapshot | null>

  /** List recent snapshots */
  listSnapshots(limit?: number): Promise<JJSnapshot[]>

  /** Rollback to a snapshot */
  rollback(target: JJSnapshot | string, options?: RollbackOptions): Promise<void>

  /** Clean up old snapshots */
  cleanup(options?: CleanupOptions): Promise<void>

  /** Wrap a tool call with snapshot management */
  wrapToolCall<T>(
    toolName: string,
    input: any,
    execute: () => Promise<T>,
    context: SnapshotContext
  ): Promise<ToolCallResult<T>>
}

/**
 * Interface for wrapping tool calls
 */
export interface ToolCallWrapper {
  /** Wrap a tool call with snapshot management */
  wrapToolCall<T>(
    toolName: string,
    input: any,
    execute: () => Promise<T>,
    context?: SnapshotContext
  ): Promise<ToolCallResult<T>>
}

/**
 * Configuration for JJ command execution
 */
export interface JJConfig {
  /** Working directory for JJ commands */
  workingDir: string

  /** Custom JJ executable path */
  jjPath?: string

  /** Additional JJ configuration */
  jjArgs?: string[]

  /** Timeout for JJ commands in milliseconds */
  timeout?: number
}

/**
 * Raw JJ changeset data from JSON output
 */
export interface RawChangesetData {
  change_id: string
  commit_id: string
  description: string
  author: { name: string; email: string }
  committer: { timestamp: string }
  empty: boolean
  conflict: boolean
  parents: Array<{ change_id: string }>
  bookmarks: Array<{ name: string }>
  working_copy?: boolean
}

/**
 * Parsed status output from JJ
 */
export interface ParsedStatus {
  modifiedFiles: string[]
  addedFiles: string[]
  deletedFiles: string[]
  untrackedFiles: string[]
  conflictedFiles: string[]
}

/**
 * VCS module integration interface
 */
export interface VCSModuleIntegration {
  /** Log a snapshot to the VCS module */
  logSnapshot(snapshot: {
    change_id: string
    commit_hash?: string
    description?: string
    files_modified?: string[]
    files_added?: string[]
    files_deleted?: string[]
    has_conflicts?: boolean
    smithers_metadata?: Record<string, any>
  }): string

  /** Get snapshots from VCS module */
  getSnapshots(limit?: number): Array<{
    id: string
    change_id: string
    description?: string
    files_modified?: string[]
    files_added?: string[]
    files_deleted?: string[]
    has_conflicts: boolean
    created_at: Date
  }>
}

/**
 * Tool categories for snapshot behavior
 */
export const READ_ONLY_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'TaskOutput'
] as const

export const WRITE_TOOLS = [
  'Edit',
  'Write',
  'Bash',
  'NotebookEdit'
] as const

export type ReadOnlyTool = typeof READ_ONLY_TOOLS[number]
export type WriteTool = typeof WRITE_TOOLS[number]
export type ToolName = ReadOnlyTool | WriteTool | string

/**
 * Error types for JJ snapshot system
 */
export class JJSnapshotError extends Error {
  public readonly cause?: Error

  constructor(message: string, cause?: Error) {
    super(message)
    this.name = 'JJSnapshotError'
    this.cause = cause
  }
}

export class ChangesetNotFoundError extends JJSnapshotError {
  constructor(changeId: string) {
    super(`Changeset not found: ${changeId}`)
    this.name = 'ChangesetNotFoundError'
  }
}

export class RepositoryNotCleanError extends JJSnapshotError {
  constructor(message = 'Repository is not in clean state') {
    super(message)
    this.name = 'RepositoryNotCleanError'
  }
}

export class RollbackFailedError extends JJSnapshotError {
  constructor(target: string, cause?: Error) {
    super(`Failed to rollback to ${target}`, cause)
    this.name = 'RollbackFailedError'
  }
}
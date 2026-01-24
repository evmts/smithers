/**
 * JJ Snapshot System - main tool call wrapper and orchestration
 * Provides comprehensive snapshot management and tool call wrapping
 */

import type {
  JJSnapshotSystem,
  JJSnapshot,
  SnapshotOptions,
  RollbackOptions,
  CleanupOptions,
  SnapshotContext,
  ToolCallResult,
  ChangesetManager,
  RepoCleaner,
  VCSModuleIntegration,
  READ_ONLY_TOOLS,
  WRITE_TOOLS,
  ToolName
} from './types.js'
import { JJSnapshotError, RepositoryNotCleanError } from './types.js'
import { uuid, now } from '../db/utils.js'

/**
 * Configuration for JJ snapshot system
 */
export interface JJSnapshotSystemConfig {
  /** Changeset manager instance */
  changesetManager: ChangesetManager

  /** Repository cleaner instance */
  repoCleaner: RepoCleaner

  /** VCS module for logging snapshots */
  vcsModule: VCSModuleIntegration

  /** Working directory */
  workingDir: string

  /** Optional configuration */
  options?: {
    /** Default snapshot description template */
    snapshotDescriptionTemplate?: string

    /** Whether to verify clean state by default */
    defaultVerifyClean?: boolean

    /** Default cleanup options */
    defaultCleanupOptions?: CleanupOptions

    /** Tools that should never trigger snapshots */
    excludedTools?: string[]
  }
}

/**
 * Create a JJ snapshot system instance
 */
export function createJJSnapshotSystem(config: JJSnapshotSystemConfig): JJSnapshotSystem {
  const { changesetManager, repoCleaner, vcsModule, workingDir, options = {} } = config

  const {
    snapshotDescriptionTemplate = 'Snapshot created at {timestamp}',
    defaultVerifyClean = false,
    defaultCleanupOptions = { maxSnapshots: 50, maxAgeInDays: 30 },
    excludedTools = []
  } = options

  return {
    async createSnapshot(snapshotOptions: SnapshotOptions = {}): Promise<JJSnapshot> {
      try {
        // Verify clean state if required
        if (snapshotOptions.verifyCleanState || defaultVerifyClean) {
          const isClean = await repoCleaner.verifyCleanState()
          if (!isClean) {
            throw new RepositoryNotCleanError('Repository is not in clean state')
          }
        }

        // Generate description
        const description = snapshotOptions.description ||
          snapshotDescriptionTemplate.replace('{timestamp}', new Date().toISOString())

        // Create new changeset
        const changeId = await changesetManager.createChangeset(description)

        // Get file changes
        const files = await changesetManager.getChangesetFiles(changeId)

        // Handle untracked files if requested
        if (snapshotOptions.includeUntracked) {
          const untrackedFiles = await repoCleaner.getUntrackedFiles()
          files.added.push(...untrackedFiles)
        }

        // Check if changeset is empty
        const isEmpty = files.modified.length === 0 &&
                       files.added.length === 0 &&
                       files.deleted.length === 0

        if (isEmpty && snapshotOptions.skipEmptyCommits) {
          // Still create snapshot record but mark as empty
        }

        // Create bookmark if requested
        if (snapshotOptions.createBookmark) {
          await changesetManager.createBookmark(snapshotOptions.createBookmark, changeId)
        }

        // Get changeset info for additional metadata
        const changesetInfo = await changesetManager.getChangeset(changeId)

        // Create snapshot object
        const snapshot: JJSnapshot = {
          id: uuid(),
          changeId,
          description,
          timestamp: new Date(),
          parentChangeId: changesetInfo?.parentIds[0],
          files,
          hasConflicts: changesetInfo?.hasConflicts || false,
          isEmpty,
          bookmarks: changesetInfo?.bookmarks
        }

        // Log to VCS module
        vcsModule.logSnapshot({
          change_id: changeId,
          description,
          files_modified: files.modified,
          files_added: files.added,
          files_deleted: files.deleted,
          has_conflicts: snapshot.hasConflicts,
          smithers_metadata: {
            snapshot_id: snapshot.id,
            timestamp: snapshot.timestamp.toISOString(),
            parent_change_id: snapshot.parentChangeId
          }
        })

        // Auto-cleanup if requested - implement inline to avoid circular reference
        if (snapshotOptions.autoCleanup) {
          try {
            const options = { ...defaultCleanupOptions, ...{} }
            const allSnapshots = await changesetManager.listChangesets()

            const snapshotsToCleanup: string[] = []

            // Apply cleanup rules
            if (options.maxSnapshots && allSnapshots.length > options.maxSnapshots) {
              const sortedSnapshots = allSnapshots
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                .slice(options.maxSnapshots)

              snapshotsToCleanup.push(...sortedSnapshots.map(s => s.changeId))
            }

            // Remove duplicates and abandon changesets
            const uniqueToCleanup = Array.from(new Set(snapshotsToCleanup))
            for (const changeId of uniqueToCleanup) {
              try {
                await changesetManager.abandonChangeset(changeId)
              } catch (error) {
                console.warn(`Failed to abandon changeset ${changeId}: ${error.message}`)
              }
            }
          } catch (cleanupError) {
            console.warn(`Auto-cleanup failed: ${cleanupError.message}`)
          }
        }

        return snapshot
      } catch (error) {
        throw new JJSnapshotError(`Failed to create snapshot: ${error.message}`, error)
      }
    },

    async getSnapshot(changeId: string): Promise<JJSnapshot | null> {
      if (!changeId || changeId.trim() === '') {
        throw new JJSnapshotError('Change ID cannot be empty')
      }

      try {
        const changesetInfo = await changesetManager.getChangeset(changeId)
        if (!changesetInfo) {
          return null
        }

        // Convert ChangesetInfo to JJSnapshot
        return {
          id: uuid(), // Generate ID since we don't store it separately
          changeId: changesetInfo.changeId,
          description: changesetInfo.description,
          timestamp: changesetInfo.timestamp,
          parentChangeId: changesetInfo.parentIds[0],
          files: changesetInfo.files,
          hasConflicts: changesetInfo.hasConflicts,
          isEmpty: changesetInfo.isEmpty,
          bookmarks: changesetInfo.bookmarks
        }
      } catch (error) {
        throw new JJSnapshotError(`Failed to get snapshot ${changeId}: ${error.message}`, error)
      }
    },

    async listSnapshots(limit?: number): Promise<JJSnapshot[]> {
      if (limit !== undefined && limit < 0) {
        throw new JJSnapshotError('Limit must be positive')
      }

      try {
        const changesets = await changesetManager.listChangesets(limit)

        return changesets.map(changeset => ({
          id: uuid(),
          changeId: changeset.changeId,
          description: changeset.description,
          timestamp: changeset.timestamp,
          parentChangeId: changeset.parentIds[0],
          files: changeset.files,
          hasConflicts: changeset.hasConflicts,
          isEmpty: changeset.isEmpty,
          bookmarks: changeset.bookmarks
        }))
      } catch (error) {
        throw new JJSnapshotError(`Failed to list snapshots: ${error.message}`, error)
      }
    },

    async rollback(target: JJSnapshot | string, rollbackOptions?: RollbackOptions): Promise<void> {
      try {
        await repoCleaner.rollback(target, rollbackOptions)
      } catch (error) {
        throw new JJSnapshotError(`Failed to rollback: ${error.message}`, error)
      }
    },

    async cleanup(cleanupOptions: CleanupOptions = {}): Promise<void> {
      try {
        const options = { ...defaultCleanupOptions, ...cleanupOptions }
        const changesets = await changesetManager.listChangesets()
        const allSnapshots = changesets.map(changeset => ({
          id: uuid(),
          changeId: changeset.changeId,
          description: changeset.description,
          timestamp: changeset.timestamp,
          parentChangeId: changeset.parentIds[0],
          files: changeset.files,
          hasConflicts: changeset.hasConflicts,
          isEmpty: changeset.isEmpty,
          bookmarks: changeset.bookmarks
        }))

        const snapshotsToCleanup: string[] = []

        // Apply cleanup rules
        if (options.maxSnapshots && allSnapshots.length > options.maxSnapshots) {
          // Remove oldest snapshots beyond limit
          const sortedSnapshots = allSnapshots
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(options.maxSnapshots)

          snapshotsToCleanup.push(...sortedSnapshots.map(s => s.changeId))
        }

        if (options.maxAgeInDays) {
          // Remove snapshots older than max age
          const cutoffDate = new Date(Date.now() - options.maxAgeInDays * 24 * 60 * 60 * 1000)
          const oldSnapshots = allSnapshots.filter(s => s.timestamp < cutoffDate)

          snapshotsToCleanup.push(...oldSnapshots.map(s => s.changeId))
        }

        if (options.emptyOnly) {
          // Only clean up empty snapshots
          const emptySnapshots = allSnapshots.filter(s => s.isEmpty)
          snapshotsToCleanup.length = 0
          snapshotsToCleanup.push(...emptySnapshots.map(s => s.changeId))
        }

        // Remove duplicates
        const uniqueToCleanup = Array.from(new Set(snapshotsToCleanup))

        if (options.dryRun) {
          console.log(`Would cleanup ${uniqueToCleanup.length} snapshots:`, uniqueToCleanup)
          return
        }

        // Abandon the changesets
        for (const changeId of uniqueToCleanup) {
          try {
            await changesetManager.abandonChangeset(changeId)
          } catch (error) {
            console.warn(`Failed to abandon changeset ${changeId}: ${error.message}`)
          }
        }
      } catch (error) {
        throw new JJSnapshotError(`Failed to cleanup snapshots: ${error.message}`, error)
      }
    },

    async wrapToolCall<T>(
      toolName: string,
      input: any,
      execute: () => Promise<T>,
      context: SnapshotContext
    ): Promise<ToolCallResult<T>> {
      // Check if this tool should trigger snapshots
      if (shouldSkipSnapshot(toolName, excludedTools)) {
        try {
          const result = await execute()
          return { success: true, result }
        } catch (error) {
          return { success: false, error: error.message }
        }
      }

      let snapshotBefore: JJSnapshot | undefined
      let snapshotAfter: JJSnapshot | undefined
      let rolledBack = false

      try {
        // Create before snapshot - inline to avoid circular reference
        const beforeDescription = `Before ${toolName} - ${context.taskId || 'Unknown task'}`
        const beforeChangeId = await changesetManager.createChangeset(beforeDescription)
        const beforeFiles = await changesetManager.getChangesetFiles(beforeChangeId)
        const beforeChangesetInfo = await changesetManager.getChangeset(beforeChangeId)

        snapshotBefore = {
          id: uuid(),
          changeId: beforeChangeId,
          description: beforeDescription,
          timestamp: new Date(),
          parentChangeId: beforeChangesetInfo?.parentIds[0],
          files: beforeFiles,
          hasConflicts: beforeChangesetInfo?.hasConflicts || false,
          isEmpty: beforeFiles.modified.length === 0 && beforeFiles.added.length === 0 && beforeFiles.deleted.length === 0,
          bookmarks: beforeChangesetInfo?.bookmarks
        }

        try {
          // Execute the tool call
          const result = await execute()

          // Create after snapshot if tool succeeded - inline to avoid circular reference
          const afterDescription = `After ${toolName} - ${context.taskId || 'Unknown task'}`
          const afterChangeId = await changesetManager.createChangeset(afterDescription)
          const afterFiles = await changesetManager.getChangesetFiles(afterChangeId)
          const afterChangesetInfo = await changesetManager.getChangeset(afterChangeId)

          snapshotAfter = {
            id: uuid(),
            changeId: afterChangeId,
            description: afterDescription,
            timestamp: new Date(),
            parentChangeId: afterChangesetInfo?.parentIds[0],
            files: afterFiles,
            hasConflicts: afterChangesetInfo?.hasConflicts || false,
            isEmpty: afterFiles.modified.length === 0 && afterFiles.added.length === 0 && afterFiles.deleted.length === 0,
            bookmarks: afterChangesetInfo?.bookmarks
          }

          // Log successful tool call with context
          vcsModule.logSnapshot({
            change_id: snapshotAfter.changeId,
            description: `Tool call success: ${toolName}`,
            smithers_metadata: {
              execution_id: context.executionId,
              agent_id: context.agentId,
              task_id: context.taskId,
              tool_name: toolName,
              tool_input: JSON.stringify(input),
              before_snapshot: snapshotBefore.changeId,
              after_snapshot: snapshotAfter.changeId,
              success: true
            }
          })

          return {
            success: true,
            result,
            snapshotBefore,
            snapshotAfter
          }
        } catch (toolError) {
          // Tool failed - rollback to before snapshot
          if (snapshotBefore) {
            await repoCleaner.rollback(snapshotBefore)
            rolledBack = true
          }

          // Log failed tool call
          vcsModule.logSnapshot({
            change_id: snapshotBefore?.changeId || 'unknown',
            description: `Tool call failed: ${toolName}`,
            smithers_metadata: {
              execution_id: context.executionId,
              agent_id: context.agentId,
              task_id: context.taskId,
              tool_name: toolName,
              tool_input: JSON.stringify(input),
              before_snapshot: snapshotBefore?.changeId,
              error: toolError.message,
              success: false,
              rolled_back: rolledBack
            }
          })

          return {
            success: false,
            error: toolError.message,
            snapshotBefore,
            rolledBack
          }
        }
      } catch (snapshotError) {
        // Snapshot creation failed - still try to execute tool
        console.warn(`Snapshot creation failed for ${toolName}: ${snapshotError.message}`)

        try {
          const result = await execute()
          return { success: true, result }
        } catch (error) {
          return { success: false, error: error.message }
        }
      }
    }
  }
}

/**
 * Determine if a tool call should skip snapshot creation
 */
function shouldSkipSnapshot(toolName: string, excludedTools: string[]): boolean {
  // Skip if explicitly excluded
  if (excludedTools.includes(toolName)) {
    return true
  }

  // Skip read-only tools
  const readOnlyTools = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'TaskOutput']
  if (readOnlyTools.includes(toolName)) {
    return true
  }

  // Skip certain utility tools
  const utilityTools = ['TaskOutput', 'KillShell', 'AskUserQuestion']
  if (utilityTools.includes(toolName)) {
    return true
  }

  return false
}

/**
 * Create a complete JJ snapshot system with all dependencies
 */
export function createCompleteJJSnapshotSystem(config: {
  workingDir: string
  jjPath?: string
  vcsModule: VCSModuleIntegration
}): JJSnapshotSystem {
  const { workingDir, jjPath = 'jj', vcsModule } = config

  // Create JJ executor
  const jjExec = async (args: string[]): Promise<string> => {
    const proc = Bun.spawn([jjPath, ...args], {
      cwd: workingDir,
      stdout: 'pipe',
      stderr: 'pipe'
    })

    await proc.exited

    if (proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`JJ command failed: ${stderr}`)
    }

    const stdout = await new Response(proc.stdout).text()
    return stdout.trim()
  }

  // Create filesystem executor
  const fsExec = async (args: string[]): Promise<string> => {
    const proc = Bun.spawn(args, {
      cwd: workingDir,
      stdout: 'pipe',
      stderr: 'pipe'
    })

    await proc.exited

    if (proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`FS command failed: ${stderr}`)
    }

    const stdout = await new Response(proc.stdout).text()
    return stdout.trim()
  }

  // Import and create dependencies
  const { createChangesetManager } = require('./changeset-manager.js')
  const { createRepoCleaner } = require('./repo-cleaner.js')

  const changesetManager = createChangesetManager({ jjExec, workingDir })
  const repoCleaner = createRepoCleaner({ jjExec, fsExec, workingDir })

  return createJJSnapshotSystem({
    changesetManager,
    repoCleaner,
    vcsModule,
    workingDir
  })
}

/**
 * Utility to create a snapshot description with context
 */
export function createSnapshotDescription(
  toolName: string,
  context: SnapshotContext,
  phase: 'before' | 'after',
  additionalInfo?: string
): string {
  const timestamp = new Date().toISOString()
  const taskInfo = context.taskId ? ` (Task: ${context.taskId})` : ''
  const agentInfo = context.agentId ? ` [Agent: ${context.agentId}]` : ''
  const extra = additionalInfo ? ` - ${additionalInfo}` : ''

  return `${phase === 'before' ? 'Before' : 'After'} ${toolName}${taskInfo}${agentInfo} at ${timestamp}${extra}`
}

/**
 * Utility to validate snapshot system configuration
 */
export function validateSnapshotConfig(config: JJSnapshotSystemConfig): void {
  if (!config.changesetManager) {
    throw new JJSnapshotError('Changeset manager is required')
  }
  if (!config.repoCleaner) {
    throw new JJSnapshotError('Repository cleaner is required')
  }
  if (!config.vcsModule) {
    throw new JJSnapshotError('VCS module is required')
  }
  if (!config.workingDir) {
    throw new JJSnapshotError('Working directory is required')
  }
}
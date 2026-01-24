/**
 * Repository Cleaner - verifies clean state and provides rollback capabilities
 */

import type {
  RepoCleaner,
  RepoState,
  JJSnapshot,
  RollbackOptions,
  JJConfig,
  ParsedStatus
} from './types.js'
import { JJSnapshotError, RollbackFailedError } from './types.js'
import { uuid } from '../db/utils.js'

/**
 * Configuration for repo cleaner
 */
export interface RepoCleanerConfig {
  /** Function to execute JJ commands */
  jjExec: (args: string[]) => Promise<string>

  /** Function to execute filesystem commands */
  fsExec: (args: string[]) => Promise<string>

  /** Working directory for operations */
  workingDir: string

  /** JJ configuration options */
  jjConfig?: Partial<JJConfig>
}

/**
 * Create a repository cleaner instance
 */
export function createRepoCleaner(config: RepoCleanerConfig): RepoCleaner {
  const { jjExec, fsExec } = config

  return {
    async verifyCleanState(): Promise<boolean> {
      try {
        const statusOutput = await jjExec(['status'])

        // JJ status returns "The working copy is clean" when clean
        if (statusOutput.includes('The working copy is clean')) {
          return true
        }

        // Check for any working copy changes or conflicts
        const parsed = parseStatusOutput(statusOutput)
        return parsed.modifiedFiles.length === 0 &&
               parsed.addedFiles.length === 0 &&
               parsed.deletedFiles.length === 0 &&
               parsed.untrackedFiles.length === 0 &&
               parsed.conflictedFiles.length === 0
      } catch (error) {
        const err = error as Error
        throw new JJSnapshotError(`Failed to verify clean state: ${err.message}`, err)
      }
    },

    async getRepoState(): Promise<RepoState> {
      try {
        // Get working copy status
        const statusOutput = await jjExec(['status'])
        const parsedStatus = parseStatusOutput(statusOutput)

        // Get current changeset info
        const currentChangeInfo = await jjExec([
          'log',
          '--revisions', '@',
          '--template', '{"change_id": change_id, "working_copy": if(working_copy, true, false), "bookmarks": bookmarks}',
          '--no-graph'
        ])

        const currentData = JSON.parse(currentChangeInfo)[0] || {}
        const currentChangeId = currentData.change_id || 'unknown'
        const workingCopyChangeId = currentData.working_copy ? currentData.change_id : undefined
        const bookmarks = currentData.bookmarks?.map((b: any) => b.name) || []

        const hasUncommittedChanges =
          parsedStatus.modifiedFiles.length > 0 ||
          parsedStatus.addedFiles.length > 0 ||
          parsedStatus.deletedFiles.length > 0

        return {
          isClean: !hasUncommittedChanges && parsedStatus.conflictedFiles.length === 0,
          currentChangeId,
          workingCopyChangeId,
          bookmarks,
          hasUncommittedChanges,
          conflictedFiles: parsedStatus.conflictedFiles,
          untrackedFiles: parsedStatus.untrackedFiles,
          modifiedFiles: parsedStatus.modifiedFiles,
          stagedFiles: parsedStatus.addedFiles, // JJ doesn't have staging, but for compatibility
          branch: bookmarks[0] // Use first bookmark as primary branch
        }
      } catch (error) {
        const err = error as Error
        throw new JJSnapshotError(`Failed to get repository state: ${err.message}`, err)
      }
    },

    async cleanRepository(options: { removeUntracked?: boolean } = {}): Promise<void> {
      try {
        // Update working copy to latest state
        await jjExec(['workspace', 'update-stale'])

        // Run garbage collection
        await jjExec(['util', 'gc'])

        // Remove untracked files if requested
        if (options.removeUntracked) {
          try {
            const statusOutput = await jjExec(['status'])
            const parsed = parseStatusOutput(statusOutput)
            const untrackedFiles = parsed.untrackedFiles

            if (untrackedFiles.length > 0) {
              for (const file of untrackedFiles) {
                try {
                  await fsExec(['rm', file])
                } catch (fileError) {
                  const fe = fileError as Error
                  console.warn(`Failed to remove untracked file ${file}: ${fe.message}`)
                }
              }
            }
          } catch (error) {
            const err = error as Error
            console.warn(`Failed to get untracked files: ${err.message}`)
          }
        }
      } catch (error) {
        const err = error as Error
        throw new JJSnapshotError(`Failed to clean repository: ${err.message}`, err)
      }
    },

    async rollback(target: JJSnapshot | string, options: RollbackOptions = {}): Promise<void> {
      try {
        const changeId = typeof target === 'string' ? target : target.changeId

        // Validate that the target changeset exists
        if (typeof target === 'string') {
          const targetChangeset = await jjExec([
            'log',
            '--revisions', changeId,
            '--template', 'exists',
            '--no-graph'
          ])

          if (!targetChangeset.trim()) {
            throw new Error(`Target changeset ${changeId} not found`)
          }
        }

        // Move to the target changeset
        await jjExec(['edit', changeId])

        // Update working copy
        await jjExec(['workspace', 'update-stale'])

        // Handle bookmark preservation
        if (!options.preserveBookmarks && typeof target === 'object' && target.bookmarks) {
          // Recreate bookmarks at the rollback point
          for (const bookmark of target.bookmarks) {
            try {
              await jjExec(['bookmark', 'set', bookmark, '--revision', changeId])
            } catch (bookmarkError) {
              // Bookmark operations are non-critical, continue rollback
              const be = bookmarkError as Error
              console.warn(`Failed to restore bookmark ${bookmark}: ${be.message}`)
            }
          }
        }

        // Cleanup intermediate changes if requested
        if (options.cleanupIntermediate) {
          await jjExec(['util', 'gc'])
        }
      } catch (error) {
        throw new RollbackFailedError(
          typeof target === 'string' ? target : target.changeId,
          error as Error
        )
      }
    },

    async createRestorePoint(description?: string): Promise<string> {
      try {
        const defaultDescription = description || `Restore point created at ${new Date().toISOString()}`

        const output = await jjExec([
          'new',
          '--message', defaultDescription
        ])

        // Extract change ID from output
        const changeIdMatch = output.match(/Working copy now at: ([a-f0-9]+)/)
        const matchedId = changeIdMatch?.[1]
        return matchedId ?? `restore-${uuid()}`
      } catch (error) {
        const err = error as Error
        throw new JJSnapshotError(`Failed to create restore point: ${err.message}`, err)
      }
    },

    async validateRepository(): Promise<boolean> {
      try {
        // Run JJ garbage collection to check repository integrity
        await jjExec(['util', 'gc'])

        // Additional validation could include checking for:
        // - Corrupted changesets
        // - Missing parent references
        // - Inconsistent working copy state

        return true
      } catch (error) {
        const err = error as Error
        console.error('Repository validation failed:', err.message)
        return false
      }
    },

    async getUntrackedFiles(): Promise<string[]> {
      try {
        const statusOutput = await jjExec(['status'])
        const parsed = parseStatusOutput(statusOutput)
        return parsed.untrackedFiles
      } catch (error) {
        const err = error as Error
        throw new JJSnapshotError(`Failed to get untracked files: ${err.message}`, err)
      }
    },

    async removeUntrackedFiles(files?: string[]): Promise<void> {
      try {
        let filesToRemove = files

        if (!filesToRemove) {
          const statusOutput = await jjExec(['status'])
          const parsed = parseStatusOutput(statusOutput)
          filesToRemove = parsed.untrackedFiles
        }

        // Remove each file individually for better error handling
        for (const file of filesToRemove) {
          await fsExec(['rm', file])
        }
      } catch (error) {
        const err = error as Error
        throw new JJSnapshotError(`Failed to remove untracked files: ${err.message}`, err)
      }
    }
  }
}

/**
 * Parse JJ status output into structured format
 */
export function parseStatusOutput(statusOutput: string): ParsedStatus {
  const result: ParsedStatus = {
    modifiedFiles: [],
    addedFiles: [],
    deletedFiles: [],
    untrackedFiles: [],
    conflictedFiles: []
  }

  if (!statusOutput || statusOutput.includes('The working copy is clean')) {
    return result
  }

  const lines = statusOutput.split('\n')
  let inConflictSection = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('There are unresolved conflicts at these paths:')) {
      inConflictSection = true
      continue
    }

    if (inConflictSection) {
      if (trimmed && !trimmed.startsWith('Working copy changes:')) {
        result.conflictedFiles.push(trimmed)
      } else if (trimmed.startsWith('Working copy changes:')) {
        inConflictSection = false
      }
      continue
    }

    // Parse file status lines
    const match = trimmed.match(/^([?MADR]+)\s+(.+)$/)
    if (!match) continue

    const status = match[1]
    const filePath = match[2]
    if (!status || !filePath) continue

    if (status.includes('M')) {
      // Modified file (M, MM)
      result.modifiedFiles.push(filePath)
    } else if (status.includes('A')) {
      // Added file
      result.addedFiles.push(filePath)
    } else if (status.includes('D')) {
      // Deleted file
      result.deletedFiles.push(filePath)
    } else if (status.includes('?')) {
      // Untracked file
      result.untrackedFiles.push(filePath)
    } else if (status.includes('R')) {
      // Renamed file - handle as delete + add
      const renameParts = filePath.split(' => ')
      const oldPath = renameParts[0]
      const newPath = renameParts[1]
      if (renameParts.length === 2 && oldPath && newPath) {
        result.deletedFiles.push(oldPath.trim())
        result.addedFiles.push(newPath.trim())
      }
    }
  }

  return result
}

/**
 * Create a default filesystem executor function using Bun
 */
export function createFSExecutor(config: JJConfig): (args: string[]) => Promise<string> {
  return async (args: string[]): Promise<string> => {
    const { workingDir, timeout = 10000 } = config

    const proc = Bun.spawn(args, {
      cwd: workingDir,
      stdout: 'pipe',
      stderr: 'pipe'
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`FS command timed out after ${timeout}ms`)), timeout)
    })

    try {
      await Promise.race([proc.exited, timeoutPromise])

      if (proc.exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        throw new Error(`FS command failed (exit ${proc.exitCode}): ${stderr}`)
      }

      const stdout = await new Response(proc.stdout).text()
      return stdout.trim()
    } catch (error) {
      proc.kill()
      throw error
    }
  }
}

/**
 * Utility to check if repository is in a valid JJ repository
 */
export async function validateJJRepository(jjExec: (args: string[]) => Promise<string>): Promise<boolean> {
  try {
    await jjExec(['status'])
    return true
  } catch {
    return false
  }
}

/**
 * Utility to get repository root directory
 */
export async function getRepositoryRoot(jjExec: (args: string[]) => Promise<string>): Promise<string> {
  try {
    const output = await jjExec(['workspace', 'root'])
    return output.trim()
  } catch (error) {
    const err = error as Error
    throw new JJSnapshotError(`Failed to get repository root: ${err.message}`, err)
  }
}

/**
 * Utility to check for repository corruption
 */
export async function checkRepositoryIntegrity(jjExec: (args: string[]) => Promise<string>): Promise<{
  isValid: boolean
  issues: string[]
}> {
  const issues: string[] = []

  try {
    // Check basic repository access
    await jjExec(['status'])
  } catch (error) {
    const err = error as Error
    issues.push(`Cannot access repository: ${err.message}`)
  }

  try {
    // Check for corrupted changesets
    await jjExec(['log', '--limit', '1'])
  } catch (error) {
    const err = error as Error
    issues.push(`Changeset history corrupted: ${err.message}`)
  }

  try {
    // Check working copy consistency
    await jjExec(['workspace', 'update-stale'])
  } catch (error) {
    const err = error as Error
    issues.push(`Working copy inconsistent: ${err.message}`)
  }

  return {
    isValid: issues.length === 0,
    issues
  }
}
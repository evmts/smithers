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
import { JJSnapshotError, RepositoryNotCleanError, RollbackFailedError } from './types.js'
import { uuid, now } from '../db/utils.js'

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
  const { jjExec, fsExec, workingDir, jjConfig = {} } = config

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
        throw new JJSnapshotError(`Failed to verify clean state: ${error.message}`, error)
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
        throw new JJSnapshotError(`Failed to get repository state: ${error.message}`, error)
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
                  console.warn(`Failed to remove untracked file ${file}: ${fileError.message}`)
                }
              }
            }
          } catch (error) {
            console.warn(`Failed to get untracked files: ${error.message}`)
          }
        }
      } catch (error) {
        throw new JJSnapshotError(`Failed to clean repository: ${error.message}`, error)
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
              console.warn(`Failed to restore bookmark ${bookmark}: ${bookmarkError.message}`)
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
          error
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
        return changeIdMatch ? changeIdMatch[1] : `restore-${uuid()}`
      } catch (error) {
        throw new JJSnapshotError(`Failed to create restore point: ${error.message}`, error)
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
        console.error('Repository validation failed:', error.message)
        return false
      }
    },

    async getUntrackedFiles(): Promise<string[]> {
      try {
        const statusOutput = await jjExec(['status'])
        const parsed = parseStatusOutput(statusOutput)
        return parsed.untrackedFiles
      } catch (error) {
        throw new JJSnapshotError(`Failed to get untracked files: ${error.message}`, error)
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
        throw new JJSnapshotError(`Failed to remove untracked files: ${error.message}`, error)
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

    const [, status, filePath] = match

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
      if (renameParts.length === 2) {
        result.deletedFiles.push(renameParts[0].trim())
        result.addedFiles.push(renameParts[1].trim())
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
      const result = await Promise.race([proc.exited, timeoutPromise])

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
  } catch (error) {
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
    throw new JJSnapshotError(`Failed to get repository root: ${error.message}`, error)
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
    issues.push(`Cannot access repository: ${error.message}`)
  }

  try {
    // Check for corrupted changesets
    await jjExec(['log', '--limit', '1'])
  } catch (error) {
    issues.push(`Changeset history corrupted: ${error.message}`)
  }

  try {
    // Check working copy consistency
    await jjExec(['workspace', 'update-stale'])
  } catch (error) {
    issues.push(`Working copy inconsistent: ${error.message}`)
  }

  return {
    isValid: issues.length === 0,
    issues
  }
}
/**
 * JJ Changeset Manager - handles JJ changeset operations
 */

import type {
  ChangesetManager,
  ChangesetInfo,
  JJConfig,
  RawChangesetData
} from './types.js'
import { JJSnapshotError } from './types.js'
import { uuid } from '../db/utils.js'

/**
 * Configuration for changeset manager
 */
export interface ChangesetManagerConfig {
  /** Function to execute JJ commands */
  jjExec: (args: string[]) => Promise<string>

  /** Working directory for operations */
  workingDir: string

  /** JJ configuration options */
  jjConfig?: Partial<JJConfig>
}

/**
 * Create a changeset manager instance
 */
export function createChangesetManager(config: ChangesetManagerConfig): ChangesetManager {
  const { jjExec, workingDir, jjConfig = {} } = config

  return {
    async createChangeset(description?: string): Promise<string> {
      try {
        const args = ['new']
        if (description) {
          args.push('--message', description)
        }

        const output = await jjExec(args)

        // Extract change ID from output
        // JJ new outputs something like "Working copy now at: abc123def456"
        const changeIdMatch = output.match(/Working copy now at: (.+)/)
        if (changeIdMatch) {
          return changeIdMatch[1].trim()
        }

        // Check if the output itself is a change ID
        if (output.match(/^[a-f0-9-]+$/)) {
          return output.trim()
        }

        // Fallback: generate UUID-based ID
        return `changeset-${uuid()}`
      } catch (error: unknown) {
        throw new JJSnapshotError(`Failed to create changeset: ${(error as Error).message}`, error as Error)
      }
    },

    async getCurrentChangeset(): Promise<ChangesetInfo | null> {
      try {
        const output = await jjExec([
          'log',
          '--revisions', '@',
          '--template', getLogTemplate(),
          '--no-graph'
        ])

        const changesets = parseChangesetOutput(JSON.parse(output))
        return changesets[0] || null
      } catch (error: unknown) {
        throw new JJSnapshotError(`Failed to get current changeset: ${(error as Error).message}`, error as Error)
      }
    },

    async getChangeset(changeId: string): Promise<ChangesetInfo | null> {
      try {
        const output = await jjExec([
          'log',
          '--revisions', changeId,
          '--template', getLogTemplate(),
          '--no-graph'
        ])

        const changesets = parseChangesetOutput(JSON.parse(output))
        return changesets[0] || null
      } catch (error: unknown) {
        // JJ returns non-zero exit code for non-existent revisions
        if ((error as Error).message.includes('No such revision')) {
          return null
        }
        throw new JJSnapshotError(`Failed to get changeset ${changeId}: ${(error as Error).message}`, error as Error)
      }
    },

    async listChangesets(limit?: number): Promise<ChangesetInfo[]> {
      try {
        const args = ['log', '--template', getLogTemplate(), '--no-graph']
        if (limit) {
          args.push('--limit', limit.toString())
        }

        const output = await jjExec(args)
        return parseChangesetOutput(JSON.parse(output))
      } catch (error: unknown) {
        throw new JJSnapshotError(`Failed to list changesets: ${error.message}`, error)
      }
    },

    async editChangeset(changeId: string): Promise<void> {
      try {
        await jjExec(['edit', changeId])
      } catch (error: unknown) {
        throw new JJSnapshotError(`Failed to edit changeset ${changeId}: ${error.message}`, error)
      }
    },

    async abandonChangeset(changeId: string): Promise<void> {
      try {
        await jjExec(['abandon', changeId])
      } catch (error: unknown) {
        throw new JJSnapshotError(`Failed to abandon changeset ${changeId}: ${error.message}`, error)
      }
    },

    async squashChangeset(sourceChangeId: string, targetChangeId?: string): Promise<void> {
      try {
        const args = ['squash', '--from', sourceChangeId]
        if (targetChangeId) {
          args.push('--into', targetChangeId)
        }

        await jjExec(args)
      } catch (error: unknown) {
        throw new JJSnapshotError(
          `Failed to squash changeset ${sourceChangeId} into ${targetChangeId || 'parent'}: ${error.message}`,
          error
        )
      }
    },

    async describeChangeset(changeId: string | undefined, description: string): Promise<void> {
      try {
        const args = ['describe', '--message', description]
        if (changeId) {
          args.splice(1, 0, '--revision', changeId)
        }

        await jjExec(args)
      } catch (error: unknown) {
        throw new JJSnapshotError(
          `Failed to describe changeset ${changeId || 'current'}: ${error.message}`,
          error
        )
      }
    },

    async getChangesetFiles(changeId: string): Promise<{
      modified: string[]
      added: string[]
      deleted: string[]
    }> {
      try {
        const output = await jjExec([
          'show',
          '--revision', changeId,
          '--summary'
        ])

        return parseFileChanges(output)
      } catch (error: unknown) {
        throw new JJSnapshotError(
          `Failed to get files for changeset ${changeId}: ${error.message}`,
          error
        )
      }
    },

    async createBookmark(name: string, changeId?: string): Promise<void> {
      try {
        const args = ['bookmark', 'create', name]
        if (changeId) {
          args.push('--revision', changeId)
        }

        await jjExec(args)
      } catch (error: unknown) {
        throw new JJSnapshotError(`Failed to create bookmark ${name}: ${error.message}`, error)
      }
    },

    async deleteBookmark(name: string): Promise<void> {
      try {
        await jjExec(['bookmark', 'delete', name])
      } catch (error: unknown) {
        throw new JJSnapshotError(`Failed to delete bookmark ${name}: ${error.message}`, error)
      }
    }
  }
}

/**
 * Get the template string for JJ log output
 */
function getLogTemplate(): string {
  return `{
    "change_id": change_id,
    "commit_id": commit_id,
    "description": description,
    "author": author,
    "committer": committer,
    "empty": empty,
    "conflict": conflict,
    "parents": parents,
    "bookmarks": bookmarks,
    "working_copy": if(working_copy, true, false)
  }`
}

/**
 * Parse JJ log output into ChangesetInfo objects
 */
export function parseChangesetOutput(rawData: RawChangesetData[]): ChangesetInfo[] {
  return rawData.map(raw => ({
    changeId: raw.change_id,
    shortId: getShortChangeId(raw.change_id), // Use utility function
    description: raw.description,
    author: raw.author ? `${raw.author.name} <${raw.author.email}>` : 'Unknown Author',
    timestamp: raw.committer ? new Date(raw.committer.timestamp) : new Date(),
    isEmpty: raw.empty,
    hasConflicts: raw.conflict,
    parentIds: raw.parents.map(p => p.change_id),
    bookmarks: raw.bookmarks?.map(b => b.name),
    files: { modified: [], added: [], deleted: [] }, // Will be populated by getChangesetFiles
    commitHash: raw.commit_id !== raw.change_id ? raw.commit_id : undefined
  }))
}

/**
 * Parse file changes from JJ show output
 */
export function parseFileChanges(showOutput: string): {
  modified: string[]
  added: string[]
  deleted: string[]
} {
  const result = {
    modified: [] as string[],
    added: [] as string[],
    deleted: [] as string[]
  }

  if (!showOutput.trim()) {
    return result
  }

  const lines = showOutput.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Parse JJ status format:
    // M  file.txt (modified)
    // A  file.txt (added)
    // D  file.txt (deleted)
    // R  old.txt => new.txt (renamed)
    // C  file.txt (copied)
    // MM file.txt (modified in multiple ways)

    const match = trimmed.match(/^([MADRC]+)\s+(.+)$/)
    if (!match) continue

    const [, status, filePath] = match

    if (status.includes('M')) {
      // Modified file
      result.modified.push(filePath)
    } else if (status.includes('A')) {
      // Added file
      result.added.push(filePath)
    } else if (status.includes('D')) {
      // Deleted file
      result.deleted.push(filePath)
    } else if (status.includes('R')) {
      // Renamed file - treat as delete old + add new
      const renameParts = filePath.split(' => ')
      if (renameParts.length === 2) {
        result.deleted.push(renameParts[0].trim())
        result.added.push(renameParts[1].trim())
      }
    } else if (status.includes('C')) {
      // Copied file - treat as added
      result.added.push(filePath)
    }
  }

  return result
}

/**
 * Create a default JJ executor function using Bun
 */
export function createJJExecutor(config: JJConfig): (args: string[]) => Promise<string> {
  return async (args: string[]): Promise<string> => {
    const { workingDir, jjPath = 'jj', jjArgs = [], timeout = 30000 } = config

    const proc = Bun.spawn([jjPath, ...jjArgs, ...args], {
      cwd: workingDir,
      stdout: 'pipe',
      stderr: 'pipe'
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`JJ command timed out after ${timeout}ms`)), timeout)
    })

    try {
      const result = await Promise.race([proc.exited, timeoutPromise])

      if (proc.exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        throw new Error(`JJ command failed (exit ${proc.exitCode}): ${stderr}`)
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
 * Utility function to validate changeset ID format
 */
export function validateChangesetId(changeId: string): boolean {
  if (!changeId || typeof changeId !== 'string') {
    return false
  }

  // JJ change IDs are typically hexadecimal strings
  // Allow both short (12+) and full length change IDs
  return /^[a-f0-9]{12,}$/.test(changeId)
}

/**
 * Utility to extract short ID from full change ID
 */
export function getShortChangeId(changeId: string, length = 12): string {
  // Handle test change IDs that contain hyphens
  const parts = changeId.split('-')
  if (parts.length > 1 && parts[0].length <= length) {
    return parts[0] // Return first part if it's within length
  }
  return changeId.substring(0, Math.min(length, changeId.length))
}
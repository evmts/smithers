/**
 * JJ version control client for snapshot operations
 * Provides high-level interface for JJ operations with proper error handling
 */

import type { ExecFunction, JJStatusResult } from './repoVerifier'

export interface JJSnapshot {
  id: string
  message: string
  isAutoSnapshot: boolean
}

export interface JJCommitResult {
  success: boolean
  commitId?: string
  message: string
}

export interface JJRestoreResult {
  success: boolean
  message: string
}

/**
 * Parse JJ status output to extract working copy changes
 */
function parseJJStatus(statusOutput: string): JJStatusResult {
  const lines = statusOutput.split('\n').map(line => line.trim()).filter(Boolean)
  const changes: string[] = []
  let inWorkingCopySection = false

  for (const line of lines) {
    // Look for "Working copy changes:" section
    if (line.startsWith('Working copy changes:')) {
      inWorkingCopySection = true
      continue
    }

    // Stop collecting if we hit another section or empty line after changes
    if (inWorkingCopySection) {
      // "(no changes)" indicates clean working copy
      if (line.includes('(no changes)')) {
        break
      }

      // Stop collecting if we hit another section
      if (line.includes(':') && !line.match(/^[MADRC]\s/)) {
        break
      }

      // Collect file status lines (M, A, D, R, C prefixes)
      if (line.match(/^[MADRC]\s/)) {
        changes.push(line)
      }
    }
  }

  return {
    isClean: changes.length === 0,
    changes
  }
}

/**
 * Extract commit ID from JJ commit output
 */
function extractCommitId(commitOutput: string): string | undefined {
  // Look for "Created commit <id>" pattern
  const match = commitOutput.match(/Created commit (\w+)/)
  return match?.[1]
}

/**
 * Parse JJ log output into snapshot objects
 */
function parseJJSnapshots(logOutput: string): JJSnapshot[] {
  return logOutput
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      // Format: "commitId message"
      const spaceIndex = line.indexOf(' ')
      if (spaceIndex === -1) return null

      const id = line.substring(0, spaceIndex)
      const message = line.substring(spaceIndex + 1)

      return {
        id,
        message,
        isAutoSnapshot: message.includes('Auto-snapshot:')
      }
    })
    .filter((snapshot): snapshot is JJSnapshot => snapshot !== null)
}

/**
 * Get current JJ repository status
 */
async function getStatus(exec: ExecFunction): Promise<JJStatusResult> {
  try {
    const result = await exec('jj status')
    return parseJJStatus(result.stdout)
  } catch (error) {
    throw new Error(`Failed to get JJ status: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Create a snapshot (commit) of the current working directory
 * Returns success=false if no changes to commit
 */
async function createSnapshot(exec: ExecFunction, message?: string): Promise<JJCommitResult> {
  try {
    // Check if there are changes to commit
    const status = await getStatus(exec)
    if (status.isClean) {
      return {
        success: false,
        message: 'No changes to snapshot'
      }
    }

    // Generate message if not provided
    const commitMessage = message || `Auto-snapshot: Tool call at ${new Date().toISOString()}`

    // Create the commit
    const result = await exec(`jj commit -m "${commitMessage}"`)
    const commitId = extractCommitId(result.stdout)

    if (!commitId) {
      return {
        success: false,
        message: 'Failed to parse commit ID from JJ output'
      }
    }

    return {
      success: true,
      commitId,
      message: commitMessage
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to create snapshot: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Get list of recent snapshots (commits)
 */
async function getSnapshots(exec: ExecFunction, limit: number = 10): Promise<JJSnapshot[]> {
  try {
    const result = await exec(
      `jj log --no-graph --template "change_id.short() ++ \\" \\" ++ description" -r "@ | @- | @--" --limit ${limit}`
    )

    return parseJJSnapshots(result.stdout)
  } catch (error) {
    throw new Error(`Failed to get snapshots: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Restore working directory to a specific snapshot
 */
async function restoreSnapshot(exec: ExecFunction, snapshotId: string): Promise<JJRestoreResult> {
  try {
    const result = await exec(`jj edit ${snapshotId}`)

    return {
      success: true,
      message: `Restored to snapshot ${snapshotId}: ${result.stdout.trim()}`
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to restore snapshot: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Undo the last JJ operation (typically the last snapshot)
 */
async function undoLastSnapshot(exec: ExecFunction): Promise<JJRestoreResult> {
  try {
    const result = await exec('jj undo')

    return {
      success: true,
      message: `Undid last snapshot: ${result.stdout.trim()}`
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to undo snapshot: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

export const jjClient = {
  getStatus,
  createSnapshot,
  getSnapshots,
  restoreSnapshot,
  undoLastSnapshot
}

export type { JJStatusResult }
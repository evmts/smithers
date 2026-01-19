// Jujutsu (jj) operations
// Uses Bun.$ for command execution per CLAUDE.md

import { parseJJStatus, parseDiffStats } from './parsers.js'
import type { CommandResult, VCSStatus, DiffStats, JJSnapshotResult, JJCommitResult } from './types.js'

/**
 * Execute a jj command
 */
export async function jj(...args: string[]): Promise<CommandResult> {
  try {
    const result = await Bun.$`jj ${args}`.quiet()
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }
  } catch (error: unknown) {
    const stderr = error && typeof error === 'object' && 'stderr' in error
      ? String(error.stderr)
      : ''
    const message = error instanceof Error ? error.message : String(error)
    const details = stderr || message || 'Unknown error'
    const wrapped = new Error(`jj ${args.join(' ')} failed: ${details}`)
    wrapped.cause = error
    throw wrapped
  }
}

/**
 * Get JJ change ID for current working copy
 */
export async function getJJChangeId(ref: string = '@'): Promise<string> {
  try {
    const result = await Bun.$`jj log -r ${ref} --no-graph -T change_id`.text()
    return result.trim()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to get JJ change ID for '${ref}': ${msg}`)
  }
}

/**
 * Create a JJ snapshot
 */
export async function jjSnapshot(message?: string): Promise<JJSnapshotResult> {
  // Run jj status to create implicit snapshot
  await Bun.$`jj status`.quiet()

  const changeId = await getJJChangeId('@')

  // Get description
  const description = message
    ? message
    : await Bun.$`jj log -r @ --no-graph -T description`.text().then((s) => s.trim())

  return { changeId, description }
}

/**
 * Create a JJ commit
 */
export async function jjCommit(message: string): Promise<JJCommitResult> {
  await Bun.$`jj commit -m ${message}`.quiet()
  // @- is the commit we just created (parent of new working copy)
  const commitHash = await Bun.$`jj log -r @- --no-graph -T commit_id`.text().then((s) => s.trim())
  const changeId = await getJJChangeId('@-')
  return { commitHash, changeId }
}

/**
 * Get JJ status
 */
export async function getJJStatus(): Promise<VCSStatus> {
  const result = await Bun.$`jj status`.text()
  return parseJJStatus(result)
}

/**
 * Get JJ diff statistics
 */
export async function getJJDiffStats(): Promise<DiffStats> {
  const result = await Bun.$`jj diff --stat`.text()
  return parseDiffStats(result)
}

/**
 * Check if we're in a jj repository
 */
export async function isJJRepo(): Promise<boolean> {
  try {
    await Bun.$`jj root`.quiet()
    return true
  } catch {
    return false
  }
}

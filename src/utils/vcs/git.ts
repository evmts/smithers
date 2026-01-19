// Git operations
// Uses Bun.$ for command execution per CLAUDE.md

import * as path from 'node:path'
import { parseGitStatus } from './parsers.js'
import type { CommandResult, VCSStatus, DiffStats, CommitInfo, WorktreeInfo } from './types.js'

const SMITHERS_NOTES_REF = 'refs/notes/smithers'

/**
 * Execute a git command
 */
export async function git(...args: string[]): Promise<CommandResult> {
  try {
    const result = await Bun.$`git ${args}`.quiet()
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }
  } catch (error) {
    const stderr = error instanceof Object && 'stderr' in error ? String((error as { stderr: unknown }).stderr) : ''
    const msg = error instanceof Error ? error.message : String(error)
    const wrapped = new Error(`git ${args.join(' ')} failed: ${stderr || msg}`)
    wrapped.cause = error
    throw wrapped
  }
}

/**
 * Get current commit hash
 */
export async function getCommitHash(ref: string = 'HEAD'): Promise<string> {
  try {
    const result = await Bun.$`git rev-parse ${ref}`.text()
    return result.trim()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to resolve ref '${ref}': ${msg}`)
  }
}

/**
 * Get commit information
 */
export async function getCommitInfo(ref: string = 'HEAD'): Promise<CommitInfo> {
  try {
    const hash = await Bun.$`git rev-parse ${ref}`.text()
    const author = await Bun.$`git log -1 --format=%an ${ref}`.text()
    const message = await Bun.$`git log -1 --format=%s ${ref}`.text()
    return {
      hash: hash.trim(),
      author: author.trim(),
      message: message.trim(),
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to get commit info for '${ref}': ${msg}`)
  }
}

/**
 * Get diff statistics
 */
export async function getDiffStats(ref?: string): Promise<DiffStats> {
  const args = ref ? `${ref}...HEAD` : 'HEAD~1'
  let result: string
  try {
    result = await Bun.$`git diff --numstat ${args}`.text()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to get diff stats for '${args}': ${msg}`)
  }

  const files: string[] = []
  let insertions = 0
  let deletions = 0

  for (const line of result.split('\n')) {
    if (!line.trim()) continue

    const [ins, del, file] = line.split('\t')
    if (ins && del && file) {
      files.push(file)
      insertions += parseInt(ins) || 0
      deletions += parseInt(del) || 0
    }
  }

  return { files, insertions, deletions }
}

/**
 * Get git status
 */
export async function getGitStatus(): Promise<VCSStatus> {
  const result = await Bun.$`git status --porcelain`.text()
  return parseGitStatus(result)
}

/**
 * Add git notes with smithers metadata
 */
export async function addGitNotes(
  content: string,
  ref: string = 'HEAD',
  append: boolean = false
): Promise<void> {
  const args = ['notes', '--ref', SMITHERS_NOTES_REF]
  if (append) {
    args.push('append')
  } else {
    args.push('add', '-f')
  }
  args.push('-m', content, ref)

  try {
    await Bun.$`git ${args}`.quiet()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to ${append ? 'append' : 'add'} git notes: ${msg}`)
  }
}

/**
 * Get git notes for a commit
 */
export async function getGitNotes(ref: string = 'HEAD'): Promise<string | null> {
  try {
    const result = await Bun.$`git notes --ref ${SMITHERS_NOTES_REF} show ${ref}`.text()
    return result.trim()
  } catch {
    return null
  }
}

/**
 * Check if git notes exist for a commit
 */
export async function hasGitNotes(ref: string = 'HEAD'): Promise<boolean> {
  const notes = await getGitNotes(ref)
  return notes !== null
}

/**
 * Check if we're in a git repository
 */
export async function isGitRepo(): Promise<boolean> {
  try {
    await Bun.$`git rev-parse --git-dir`.quiet()
    return true
  } catch {
    return false
  }
}

/**
 * Get current branch name (git)
 */
export async function getCurrentBranch(): Promise<string | null> {
  try {
    const result = await Bun.$`git branch --show-current`.text()
    return result.trim() || null
  } catch {
    return null
  }
}

/**
 * Parse `git worktree list --porcelain` output
 */
export function parseWorktreeList(output: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = []
  let current: Partial<WorktreeInfo> = {}

  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) {
        worktrees.push(current as WorktreeInfo)
      }
      current = { path: line.slice(9) }
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice(5)
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice(7).replace('refs/heads/', '')
    } else if (line === 'detached' || line === 'bare') {
      current.branch = null
    } else if (line === 'locked') {
      current.locked = true
    } else if (line === 'prunable') {
      current.prunable = true
    }
  }

  if (current.path) {
    worktrees.push(current as WorktreeInfo)
  }

  return worktrees
}

/**
 * List all worktrees for the repository
 */
export async function listWorktrees(cwd?: string): Promise<WorktreeInfo[]> {
  const args = cwd
    ? ['-C', cwd, 'worktree', 'list', '--porcelain']
    : ['worktree', 'list', '--porcelain']
  const result = await Bun.$`git ${args}`.quiet()
  return parseWorktreeList(result.stdout.toString())
}

/**
 * Add a new worktree
 */
export async function addWorktree(
  worktreePath: string,
  branch: string,
  options?: {
    base?: string
    createBranch?: boolean
    cwd?: string
  }
): Promise<void> {
  if (options?.createBranch) {
    const exists = await branchExists(branch, options.cwd)
    if (exists) {
      throw new Error(`Branch '${branch}' already exists. Cannot create worktree with -b flag.`)
    }
  }

  const args: string[] = []

  if (options?.cwd) {
    args.push('-C', options.cwd)
  }

  args.push('worktree', 'add')

  if (options?.createBranch) {
    args.push('-b', branch, worktreePath, options.base ?? 'HEAD')
  } else {
    args.push(worktreePath, branch)
  }

  await Bun.$`git ${args}`.quiet()
}

/**
 * Remove a worktree
 */
export async function removeWorktree(
  worktreePath: string,
  options?: { force?: boolean; cwd?: string }
): Promise<void> {
  const args: string[] = []

  if (options?.cwd) {
    args.push('-C', options.cwd)
  }

  args.push('worktree', 'remove')

  if (options?.force) {
    args.push('--force')
  }

  args.push(worktreePath)

  await Bun.$`git ${args}`.quiet()
}

/**
 * Check if a branch exists
 */
export async function branchExists(branch: string, cwd?: string): Promise<boolean> {
  try {
    const args = cwd
      ? ['-C', cwd, 'rev-parse', '--verify', `refs/heads/${branch}`]
      : ['rev-parse', '--verify', `refs/heads/${branch}`]
    await Bun.$`git ${args}`.quiet()
    return true
  } catch {
    return false
  }
}

/**
 * Check if a worktree exists at path
 */
export async function worktreeExists(worktreePath: string, cwd?: string): Promise<boolean> {
  const worktrees = await listWorktrees(cwd)
  const normalizedPath = path.resolve(worktreePath)
  return worktrees.some(wt => path.resolve(wt.path) === normalizedPath)
}

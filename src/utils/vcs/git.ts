// Git operations
// Uses Bun.$ for command execution per CLAUDE.md

import { parseGitStatus } from './parsers'
import type { CommandResult, VCSStatus, DiffStats, CommitInfo } from './types'

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
  } catch (error: any) {
    throw new Error(`git ${args.join(' ')} failed: ${error.stderr?.toString() || error.message}`)
  }
}

/**
 * Get current commit hash
 */
export async function getCommitHash(ref: string = 'HEAD'): Promise<string> {
  const result = await Bun.$`git rev-parse ${ref}`.text()
  return result.trim()
}

/**
 * Get commit information
 */
export async function getCommitInfo(ref: string = 'HEAD'): Promise<CommitInfo> {
  const hash = await Bun.$`git rev-parse ${ref}`.text()
  const author = await Bun.$`git log -1 --format=%an ${ref}`.text()
  const message = await Bun.$`git log -1 --format=%s ${ref}`.text()

  return {
    hash: hash.trim(),
    author: author.trim(),
    message: message.trim(),
  }
}

/**
 * Get diff statistics
 */
export async function getDiffStats(ref?: string): Promise<DiffStats> {
  const args = ref ? `${ref}...HEAD` : 'HEAD~1'
  const result = await Bun.$`git diff --numstat ${args}`.text()

  const files: string[] = []
  let insertions = 0
  let deletions = 0

  for (const line of result.split('\n')) {
    if (!line.trim()) continue

    const [ins, del, file] = line.split('\t')
    files.push(file)
    insertions += parseInt(ins) || 0
    deletions += parseInt(del) || 0
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
  const flag = append ? 'append' : 'add'
  const forceFlag = append ? '' : '-f'

  try {
    await Bun.$`git notes --ref ${SMITHERS_NOTES_REF} ${flag} ${forceFlag} -m ${content} ${ref}`.quiet()
  } catch (error: any) {
    throw new Error(`Failed to ${flag} git notes: ${error.message}`)
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

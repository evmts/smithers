// VCS utilities for git and jj operations
// Uses Bun.$ for command execution per CLAUDE.md

/**
 * Execute a git command
 */
export async function git(...args: string[]): Promise<{ stdout: string; stderr: string }> {
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
 * Execute a jj command
 */
export async function jj(...args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await Bun.$`jj ${args}`.quiet()
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }
  } catch (error: any) {
    throw new Error(`jj ${args.join(' ')} failed: ${error.stderr?.toString() || error.message}`)
  }
}

// ============================================================================
// GIT OPERATIONS
// ============================================================================

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
export async function getCommitInfo(ref: string = 'HEAD'): Promise<{
  hash: string
  author: string
  message: string
}> {
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
export async function getDiffStats(ref?: string): Promise<{
  files: string[]
  insertions: number
  deletions: number
}> {
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
 * Parse git status output
 */
export function parseGitStatus(output: string): {
  modified: string[]
  added: string[]
  deleted: string[]
} {
  const modified: string[] = []
  const added: string[] = []
  const deleted: string[] = []

  for (const line of output.split('\n')) {
    if (!line.trim()) continue

    const status = line.substring(0, 2)
    const file = line.substring(3)

    if (status.includes('M')) modified.push(file)
    else if (status.includes('A')) added.push(file)
    else if (status.includes('D')) deleted.push(file)
  }

  return { modified, added, deleted }
}

/**
 * Get git status
 */
export async function getGitStatus(): Promise<{
  modified: string[]
  added: string[]
  deleted: string[]
}> {
  const result = await Bun.$`git status --porcelain`.text()
  return parseGitStatus(result)
}

// ============================================================================
// GIT NOTES OPERATIONS (smithers namespace)
// ============================================================================

const SMITHERS_NOTES_REF = 'refs/notes/smithers'

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

// ============================================================================
// JJ OPERATIONS
// ============================================================================

/**
 * Get JJ change ID for current working copy
 */
export async function getJJChangeId(ref: string = '@'): Promise<string> {
  const result = await Bun.$`jj log -r ${ref} --no-graph -T change_id`.text()
  return result.trim()
}

/**
 * Create a JJ snapshot
 */
export async function jjSnapshot(message?: string): Promise<{
  changeId: string
  description: string
}> {
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
export async function jjCommit(message: string): Promise<{
  commitHash: string
  changeId: string
}> {
  // Commit with message
  await Bun.$`jj commit -m ${message}`.quiet()

  // Get commit hash and change ID
  const commitHash = await Bun.$`jj log -r @ --no-graph -T commit_id`.text().then((s) => s.trim())
  const changeId = await getJJChangeId('@')

  return { commitHash, changeId }
}

/**
 * Parse JJ status output
 */
export function parseJJStatus(output: string): {
  modified: string[]
  added: string[]
  deleted: string[]
} {
  const modified: string[] = []
  const added: string[] = []
  const deleted: string[] = []

  for (const line of output.split('\n')) {
    if (!line.trim()) continue

    if (line.startsWith('M ')) modified.push(line.substring(2).trim())
    else if (line.startsWith('A ')) added.push(line.substring(2).trim())
    else if (line.startsWith('D ')) deleted.push(line.substring(2).trim())
  }

  return { modified, added, deleted }
}

/**
 * Get JJ status
 */
export async function getJJStatus(): Promise<{
  modified: string[]
  added: string[]
  deleted: string[]
}> {
  const result = await Bun.$`jj status`.text()
  return parseJJStatus(result)
}

/**
 * Get JJ diff statistics
 */
export async function getJJDiffStats(): Promise<{
  files: string[]
  insertions: number
  deletions: number
}> {
  const result = await Bun.$`jj diff --stat`.text()
  return parseDiffStats(result)
}

// ============================================================================
// SHARED UTILITIES
// ============================================================================

/**
 * Parse diff statistics from output
 */
export function parseDiffStats(output: string): {
  files: string[]
  insertions: number
  deletions: number
} {
  const files: string[] = []
  let insertions = 0
  let deletions = 0

  const lines = output.split('\n')

  for (const line of lines) {
    if (!line.trim()) continue

    // Match pattern like: "file.ts | 10 +++++++---"
    const match = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s+([+\-]+)/)
    if (match) {
      const [, file, changes, symbols] = match
      files.push(file.trim())

      for (const symbol of symbols) {
        if (symbol === '+') insertions++
        else if (symbol === '-') deletions++
      }
    }
  }

  return { files, insertions, deletions }
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

import type { ExecFunction } from '../types'

/**
 * Comprehensive JJ (Jujutsu) VCS operations utilities
 * All functions are pure and accept ExecFunction for testability
 */

// Types for JJ operations
export interface JJCommitInfo {
  commit_id: string
  change_id: string
  author: string
  date: string
  message: string
  parent_commits: string[]
}

export interface JJBranch {
  name: string
  commit_id: string
  is_current: boolean
  upstream?: string
}

export interface JJConflict {
  file: string
  sides: string[]
  status: 'unresolved' | 'resolved'
}

export interface JJRebaseResult {
  success: boolean
  commits_rebased: number
  conflicts: JJConflict[]
  new_head?: string
}

export interface JJWorkingCopyStatus {
  parent: string | null
  changes: Array<{
    status: 'A' | 'M' | 'D' // Added, Modified, Deleted
    file: string
  }>
  isClean: boolean
}

export interface JJDiffStats {
  files: number
  insertions: number
  deletions: number
  fileDetails: Array<{
    file: string
    insertions: number
    deletions: number
  }>
}

export interface JJBookmark {
  name: string
  commit: string
}

export interface JJWorkspace {
  name: string
  path: string
  current_commit?: string
}

// Commit Information Operations
export async function getCommitInfo(exec: ExecFunction, commitRef: string): Promise<JJCommitInfo | null> {
  try {
    const result = await exec(`jj log -r ${commitRef} --template "{commit_id}\n{change_id}\n{author}\n{date}\n{description}\n{parents}"`)

    if (result.exitCode !== 0) return null

    const lines = result.stdout.trim().split('\n')
    if (lines.length < 6) return null

    return {
      commit_id: lines[0],
      change_id: lines[1],
      author: lines[2],
      date: lines[3],
      message: lines[4],
      parent_commits: lines[5] ? lines[5].split(' ').filter(p => p.length > 0) : []
    }
  } catch {
    return null
  }
}

export async function getCommitAncestors(
  exec: ExecFunction,
  commitRef: string,
  limit?: number
): Promise<string[]> {
  try {
    const limitArg = limit ? `-l ${limit}` : ''
    const result = await exec(`jj log -r "ancestors(${commitRef})" ${limitArg} --template "{commit_id}\n"`)

    if (result.exitCode !== 0) return []

    return result.stdout.trim().split('\n').filter(id => id.length > 0)
  } catch {
    return []
  }
}

export async function getCommitDescendants(
  exec: ExecFunction,
  commitRef: string
): Promise<string[]> {
  try {
    const result = await exec(`jj log -r "descendants(${commitRef})" --template "{commit_id}\n"`)

    if (result.exitCode !== 0) return []

    return result.stdout.trim().split('\n').filter(id => id.length > 0)
  } catch {
    return []
  }
}

export async function getCommitRange(
  exec: ExecFunction,
  fromRef: string,
  toRef: string,
  limit?: number
): Promise<JJCommitInfo[]> {
  try {
    const limitArg = limit ? `-l ${limit}` : ''
    const result = await exec(
      `jj log -r "${fromRef}..${toRef}" ${limitArg} --template "{commit_id}\n{change_id}\n{author}\n{date}\n{description}\n{parents}\n---\n"`
    )

    if (result.exitCode !== 0) return []

    const commits: JJCommitInfo[] = []
    const entries = result.stdout.split('---\n').filter(entry => entry.trim().length > 0)

    for (const entry of entries) {
      const lines = entry.trim().split('\n')
      if (lines.length >= 6) {
        commits.push({
          commit_id: lines[0],
          change_id: lines[1],
          author: lines[2],
          date: lines[3],
          message: lines[4],
          parent_commits: lines[5] ? lines[5].split(' ').filter(p => p.length > 0) : []
        })
      }
    }

    return commits
  } catch {
    return []
  }
}

// Branch Operations
export async function listBranches(exec: ExecFunction): Promise<JJBranch[]> {
  try {
    const result = await exec('jj branch list')

    if (result.exitCode !== 0) return []

    return result.stdout.trim().split('\n').map(line => {
      const match = line.match(/^(\S+):\s+(\S+)(\s+\[current\])?/)
      if (!match) return null

      return {
        name: match[1],
        commit_id: match[2],
        is_current: !!match[3]
      }
    }).filter((branch): branch is JJBranch => branch !== null)
  } catch {
    return []
  }
}

export async function createBranch(
  exec: ExecFunction,
  branchName: string,
  fromRef?: string
): Promise<boolean> {
  try {
    const baseRef = fromRef ? `-r ${fromRef}` : ''
    const result = await exec(`jj branch create ${branchName} ${baseRef}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function deleteBranch(exec: ExecFunction, branchName: string): Promise<boolean> {
  try {
    const result = await exec(`jj branch delete ${branchName}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function renameBranch(
  exec: ExecFunction,
  oldName: string,
  newName: string
): Promise<boolean> {
  try {
    const result = await exec(`jj branch rename ${oldName} ${newName}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function setBranchTarget(
  exec: ExecFunction,
  branchName: string,
  targetRef: string
): Promise<boolean> {
  try {
    const result = await exec(`jj branch set ${branchName} -r ${targetRef}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

// Rebase Operations
export async function rebaseCommits(
  exec: ExecFunction,
  source: string,
  destination: string
): Promise<JJRebaseResult> {
  try {
    const result = await exec(`jj rebase -s ${source} -d ${destination}`)

    const success = result.exitCode === 0
    const commits = success ? parseInt(result.stdout.match(/Rebased (\d+) commits/)?.[1] || '0') : 0
    const newHead = success ? result.stdout.match(/New head: (\S+)/)?.[1] : undefined

    if (!success) {
      // Check for conflicts
      const conflicts = await getConflicts(exec)
      return {
        success: false,
        commits_rebased: 0,
        conflicts,
        new_head: undefined
      }
    }

    return {
      success,
      commits_rebased: commits,
      conflicts: [],
      new_head: newHead
    }
  } catch {
    return {
      success: false,
      commits_rebased: 0,
      conflicts: [],
      new_head: undefined
    }
  }
}

export async function rebaseInteractive(
  exec: ExecFunction,
  fromRef: string,
  toRef?: string
): Promise<boolean> {
  try {
    const range = toRef ? `${fromRef}..${toRef}` : fromRef
    const result = await exec(`jj rebase -r ${range} --interactive`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function checkRebaseConflicts(
  exec: ExecFunction,
  source: string,
  destination: string
): Promise<string[]> {
  try {
    const result = await exec(`jj rebase -s ${source} -d ${destination} --dry-run`)

    if (result.exitCode === 0) return []

    const conflicts = result.stderr
      .split('\n')
      .filter(line => line.includes('conflict') || line.includes('Conflict'))
      .map(line => {
        const match = line.match(/(?:conflict|Conflict) in (\S+)/)
        return match ? match[1] : null
      })
      .filter((file): file is string => file !== null)

    return conflicts
  } catch {
    return []
  }
}

// Merge Operations
export async function createMergeCommit(
  exec: ExecFunction,
  branch1: string,
  branch2: string,
  message?: string
): Promise<string | null> {
  try {
    const messageArg = message ? `-m "${message}"` : ''
    const result = await exec(`jj new ${branch1} ${branch2} --merge ${messageArg}`)

    if (result.exitCode !== 0) return null

    const match = result.stdout.match(/Created (?:merge )?commit (\S+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

export async function checkMergeConflicts(
  exec: ExecFunction,
  branch1: string,
  branch2: string
): Promise<string[]> {
  try {
    const result = await exec(`jj new ${branch1} ${branch2} --merge --dry-run`)

    if (result.exitCode === 0) return []

    const conflicts = result.stderr
      .split('\n')
      .filter(line => line.includes('conflicts in'))
      .map(line => line.match(/conflicts in (\S+)/)?.[1])
      .filter((file): file is string => file !== undefined)

    return conflicts
  } catch {
    return []
  }
}

// Squash Operations
export async function squashCommits(
  exec: ExecFunction,
  revisionRange: string
): Promise<string | null> {
  try {
    const result = await exec(`jj squash -r ${revisionRange}`)

    if (result.exitCode !== 0) return null

    const match = result.stdout.match(/(?:Result|Created): (\S+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

export async function squashIntoParent(
  exec: ExecFunction,
  commitRef: string
): Promise<boolean> {
  try {
    const result = await exec(`jj squash -r ${commitRef} --into-parent`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function squashRange(
  exec: ExecFunction,
  startRef: string,
  endRef: string,
  message?: string
): Promise<string | null> {
  try {
    const messageArg = message ? `-m "${message}"` : ''
    const result = await exec(`jj squash -r ${startRef}::${endRef} ${messageArg}`)

    if (result.exitCode !== 0) return null

    const match = result.stdout.match(/(?:Result|Created): (\S+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

// Working Copy Operations
export async function getWorkingCopyStatus(exec: ExecFunction): Promise<JJWorkingCopyStatus | null> {
  try {
    const result = await exec('jj status')

    if (result.exitCode !== 0) return null

    const lines = result.stdout.split('\n')
    const parentMatch = lines.find(line => line.startsWith('Parent commit:'))?.match(/Parent commit: (\S+)/)
    const parent = parentMatch ? parentMatch[1] : null

    const isClean = result.stdout.includes('Working copy: clean')

    const changes = lines
      .filter(line => line.match(/^[AMD]\s+/))
      .map(line => {
        const match = line.match(/^([AMD])\s+(.+)$/)
        if (!match) return null
        return {
          status: match[1] as 'A' | 'M' | 'D',
          file: match[2]
        }
      })
      .filter(change => change !== null) as Array<{ status: 'A' | 'M' | 'D', file: string }>

    return { parent, changes, isClean }
  } catch {
    return null
  }
}

export async function restoreWorkingCopy(
  exec: ExecFunction,
  files?: string[]
): Promise<boolean> {
  try {
    const filesArg = files ? files.join(' ') : '.'
    const result = await exec(`jj restore ${filesArg}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function editCommit(exec: ExecFunction, commitRef: string): Promise<boolean> {
  try {
    const result = await exec(`jj edit ${commitRef}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function newCommit(
  exec: ExecFunction,
  parentRefs: string[],
  message?: string
): Promise<string | null> {
  try {
    const parents = parentRefs.join(' ')
    const messageArg = message ? `-m "${message}"` : ''
    const result = await exec(`jj new ${parents} ${messageArg}`)

    if (result.exitCode !== 0) return null

    const match = result.stdout.match(/Created (?:new )?commit (\S+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

// Conflict Resolution
export async function getConflicts(exec: ExecFunction): Promise<JJConflict[]> {
  try {
    const result = await exec('jj resolve --list')

    if (result.exitCode !== 0 || !result.stdout.trim()) return []

    return result.stdout.trim().split('\n').map(line => {
      const match = line.match(/^(\S+):\s+(\d+)-sided conflict/)
      if (!match) return null

      return {
        file: match[1],
        sides: Array.from({ length: parseInt(match[2]) }, (_, i) => `side_${i + 1}`),
        status: 'unresolved' as const
      }
    }).filter((conflict): conflict is JJConflict => conflict !== null)
  } catch {
    return []
  }
}

export async function resolveConflictWithTool(
  exec: ExecFunction,
  file: string,
  tool?: string
): Promise<boolean> {
  try {
    const toolArg = tool ? `--tool ${tool}` : ''
    const result = await exec(`jj resolve ${toolArg} ${file}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function resolveConflictManually(
  exec: ExecFunction,
  file: string
): Promise<boolean> {
  try {
    const result = await exec(`jj resolve ${file}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

// Diff Operations
export async function getDiff(
  exec: ExecFunction,
  fromRef?: string,
  toRef?: string,
  paths?: string[]
): Promise<string> {
  try {
    const range = fromRef && toRef ? `-r ${fromRef}..${toRef}` : fromRef ? `-r ${fromRef}` : ''
    const pathsArg = paths ? paths.join(' ') : ''
    const result = await exec(`jj diff ${range} ${pathsArg}`)

    return result.exitCode === 0 ? result.stdout : ''
  } catch {
    return ''
  }
}

export async function getDiffStats(
  exec: ExecFunction,
  fromRef?: string,
  toRef?: string
): Promise<JJDiffStats | null> {
  try {
    const range = fromRef && toRef ? `-r ${fromRef}..${toRef}` : fromRef ? `-r ${fromRef}` : ''
    const result = await exec(`jj diff --stat ${range}`)

    if (result.exitCode !== 0) return null

    const lines = result.stdout.split('\n')
    const fileDetails: Array<{ file: string; insertions: number; deletions: number }> = []

    let files = 0
    let totalInsertions = 0
    let totalDeletions = 0

    lines.forEach(line => {
      // Parse individual file lines
      const fileMatch = line.match(/^(.+?)\s*\|\s*(\d+)\s*([+\-]*)$/)
      if (fileMatch) {
        const fileName = fileMatch[1].trim()
        const changes = parseInt(fileMatch[2])
        const changeMarkers = fileMatch[3]

        const insertions = (changeMarkers.match(/\+/g) || []).length
        const deletions = (changeMarkers.match(/-/g) || []).length

        fileDetails.push({
          file: fileName,
          insertions,
          deletions
        })
      }

      // Parse summary line
      const summaryMatch = line.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(\-\))?/)
      if (summaryMatch) {
        files = parseInt(summaryMatch[1])
        totalInsertions = summaryMatch[2] ? parseInt(summaryMatch[2]) : 0
        totalDeletions = summaryMatch[3] ? parseInt(summaryMatch[3]) : 0
      }
    })

    return {
      files,
      insertions: totalInsertions,
      deletions: totalDeletions,
      fileDetails
    }
  } catch {
    return null
  }
}

export async function getDiffSummary(
  exec: ExecFunction,
  fromRef?: string,
  toRef?: string
): Promise<{ files: string[]; hasChanges: boolean }> {
  try {
    const range = fromRef && toRef ? `-r ${fromRef}..${toRef}` : fromRef ? `-r ${fromRef}` : ''
    const result = await exec(`jj diff --name-only ${range}`)

    if (result.exitCode !== 0) {
      return { files: [], hasChanges: false }
    }

    const files = result.stdout.trim().split('\n').filter(file => file.length > 0)

    return {
      files,
      hasChanges: files.length > 0
    }
  } catch {
    return { files: [], hasChanges: false }
  }
}

// Bookmark Operations
export async function createBookmark(
  exec: ExecFunction,
  name: string,
  commitRef?: string
): Promise<boolean> {
  try {
    const ref = commitRef ? `-r ${commitRef}` : ''
    const result = await exec(`jj bookmark create ${name} ${ref}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function deleteBookmark(exec: ExecFunction, name: string): Promise<boolean> {
  try {
    const result = await exec(`jj bookmark delete ${name}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function listBookmarks(exec: ExecFunction): Promise<JJBookmark[]> {
  try {
    const result = await exec('jj bookmark list')

    if (result.exitCode !== 0) return []

    return result.stdout.trim().split('\n').map(line => {
      const match = line.match(/^(\S+):\s+(\S+)/)
      if (!match) return null
      return { name: match[1], commit: match[2] }
    }).filter((bookmark): bookmark is JJBookmark => bookmark !== null)
  } catch {
    return []
  }
}

export async function setBookmark(
  exec: ExecFunction,
  name: string,
  commitRef: string
): Promise<boolean> {
  try {
    const result = await exec(`jj bookmark set ${name} -r ${commitRef}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

// Workspace Operations
export async function createWorkspace(
  exec: ExecFunction,
  name: string,
  path: string
): Promise<boolean> {
  try {
    const result = await exec(`jj workspace add ${name} ${path}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function listWorkspaces(exec: ExecFunction): Promise<JJWorkspace[]> {
  try {
    const result = await exec('jj workspace list')

    if (result.exitCode !== 0) return []

    return result.stdout.trim().split('\n').map(line => {
      const match = line.match(/^(\S+):\s+(\S+)(?:\s+\[(\S+)\])?/)
      if (!match) return null

      return {
        name: match[1],
        path: match[2],
        current_commit: match[3]
      }
    }).filter((ws): ws is JJWorkspace => ws !== null)
  } catch {
    return []
  }
}

export async function removeWorkspace(exec: ExecFunction, name: string): Promise<boolean> {
  try {
    const result = await exec(`jj workspace remove ${name}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

// Git Interop Operations
export async function exportToGit(exec: ExecFunction): Promise<boolean> {
  try {
    const result = await exec('jj git export')
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function importFromGit(exec: ExecFunction): Promise<boolean> {
  try {
    const result = await exec('jj git import')
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function gitPush(
  exec: ExecFunction,
  remote: string = 'origin',
  branches?: string[]
): Promise<boolean> {
  try {
    const branchArgs = branches ? `--branch ${branches.join(' --branch ')}` : '--all'
    const result = await exec(`jj git push ${remote} ${branchArgs}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function gitFetch(
  exec: ExecFunction,
  remote: string = 'origin'
): Promise<boolean> {
  try {
    const result = await exec(`jj git fetch ${remote}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

// Utility Operations
export async function undoOperation(exec: ExecFunction, count: number = 1): Promise<boolean> {
  try {
    const result = await exec(`jj undo --num-operations ${count}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function describeCommit(
  exec: ExecFunction,
  commitRef: string,
  message: string
): Promise<boolean> {
  try {
    const result = await exec(`jj describe -r ${commitRef} -m "${message}"`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function duplicateCommit(
  exec: ExecFunction,
  commitRef: string,
  destination?: string
): Promise<string | null> {
  try {
    const destArg = destination ? `-d ${destination}` : ''
    const result = await exec(`jj duplicate -r ${commitRef} ${destArg}`)

    if (result.exitCode !== 0) return null

    const match = result.stdout.match(/Created (?:duplicate )?commit (\S+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

export async function abandonCommit(exec: ExecFunction, commitRef: string): Promise<boolean> {
  try {
    const result = await exec(`jj abandon ${commitRef}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}

// Advanced Operations
export async function cherryPick(
  exec: ExecFunction,
  commitRef: string,
  destination?: string
): Promise<string | null> {
  try {
    // JJ doesn't have cherry-pick, but we can use duplicate + rebase
    const duplicated = await duplicateCommit(exec, commitRef, destination)
    if (!duplicated) return null

    if (destination) {
      const rebased = await rebaseCommits(exec, duplicated, destination)
      return rebased.success ? rebased.new_head || duplicated : null
    }

    return duplicated
  } catch {
    return null
  }
}

export async function splitCommit(
  exec: ExecFunction,
  commitRef: string
): Promise<{ first: string; second: string } | null> {
  try {
    const result = await exec(`jj split -r ${commitRef}`)

    if (result.exitCode !== 0) return null

    const lines = result.stdout.split('\n')
    const firstMatch = lines.find(line => line.includes('First:'))?.match(/First: (\S+)/)
    const secondMatch = lines.find(line => line.includes('Second:'))?.match(/Second: (\S+)/)

    if (!firstMatch || !secondMatch) return null

    return {
      first: firstMatch[1],
      second: secondMatch[1]
    }
  } catch {
    return null
  }
}

export async function absorb(exec: ExecFunction, fromRef?: string): Promise<boolean> {
  try {
    const fromArg = fromRef ? `--from ${fromRef}` : ''
    const result = await exec(`jj absorb ${fromArg}`)
    return result.exitCode === 0
  } catch {
    return false
  }
}
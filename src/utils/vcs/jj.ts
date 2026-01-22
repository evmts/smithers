import { parseJJStatus, parseDiffStats } from './parsers.js'
import type { CommandResult, VCSStatus, DiffStats, JJSnapshotResult, JJCommitResult } from './types.js'

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

export async function getJJChangeId(ref: string = '@'): Promise<string> {
  try {
    const result = await Bun.$`jj log -r ${ref} --no-graph -T change_id`.text()
    return result.trim()
  } catch (error) {
    throw new Error(`Failed to get JJ change ID for '${ref}'`, { cause: error })
  }
}

export async function jjSnapshot(message?: string): Promise<JJSnapshotResult> {
  await Bun.$`jj status`.quiet()

  const changeId = await getJJChangeId('@')

  const description = message
    ? message
    : await Bun.$`jj log -r @ --no-graph -T description`.text().then((s) => s.trim())

  return { changeId, description }
}

export async function jjCommit(message: string): Promise<JJCommitResult> {
  await Bun.$`jj commit -m ${message}`.quiet()
  const commitHash = await Bun.$`jj log -r @- --no-graph -T commit_id`.text().then((s) => s.trim())
  const changeId = await getJJChangeId('@-')
  return { commitHash, changeId }
}

export async function getJJStatus(): Promise<VCSStatus> {
  const result = await Bun.$`jj status`.text()
  return parseJJStatus(result)
}

export async function getJJDiffStats(): Promise<DiffStats> {
  const result = await Bun.$`jj diff --stat`.text()
  return parseDiffStats(result)
}

export async function isJJRepo(): Promise<boolean> {
  try {
    await Bun.$`jj root`.quiet()
    return true
  } catch {
    return false
  }
}

export interface JJStateSnapshot {
  changeId: string
  description: string
  status: VCSStatus
  isJJRepo: boolean
  timestamp: number
}

let cachedSnapshot: JJStateSnapshot | null = null
let lastFetchTime = 0
let inFlight: Promise<JJStateSnapshot> | null = null
const CACHE_TTL_MS = 100

export function getSnapshot(): JJStateSnapshot | null {
  return cachedSnapshot
}

export async function refreshSnapshot(): Promise<JJStateSnapshot> {
  const now = Date.now()

  if (cachedSnapshot && (now - lastFetchTime) < CACHE_TTL_MS) {
    return cachedSnapshot
  }

  if (inFlight) return inFlight

  inFlight = (async () => {
    const isRepo = await isJJRepo()
    
    if (!isRepo) {
      const snapshot: JJStateSnapshot = {
        changeId: '',
        description: '',
        status: { modified: [], added: [], deleted: [] },
        isJJRepo: false,
        timestamp: Date.now(),
      }
      cachedSnapshot = snapshot
      lastFetchTime = Date.now()
      return snapshot
    }

    const [changeId, description, status] = await Promise.all([
      getJJChangeId('@'),
      Bun.$`jj log -r @ --no-graph -T description`.text().then(s => s.trim()),
      getJJStatus(),
    ])

    const snapshot: JJStateSnapshot = {
      changeId,
      description,
      status,
      isJJRepo: true,
      timestamp: Date.now(),
    }
    
    cachedSnapshot = snapshot
    lastFetchTime = Date.now()
    return snapshot
  })().finally(() => {
    inFlight = null
  })

  return inFlight
}

export function clearSnapshotCache(): void {
  cachedSnapshot = null
  lastFetchTime = 0
}

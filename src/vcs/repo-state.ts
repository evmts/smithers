/**
 * Repository State Tracker - Monitors and tracks JJ repository state changes
 * Provides real-time state monitoring, caching, and event-driven updates
 */

import type { JJWrapper } from './jj-wrapper.js'

export interface RepoState {
  isClean: boolean
  currentChangeId: string
  workingCopyChangeId: string
  bookmarks: string[]
  hasUncommittedChanges: boolean
  conflictedFiles: string[]
  untrackedFiles: string[]
  modifiedFiles: string[]
  stagedFiles: string[]
  lastSnapshot?: {
    changeId: string
    timestamp: Date
    description: string
  }
  metadata: {
    lastChecked: Date
    jjVersion?: string
    repoRoot: string
  }
}

export interface RepoStateDiff {
  hasChanges: boolean
  changeDetails: Record<string, {
    from?: any
    to?: any
    added?: string[]
    removed?: string[]
  }>
}

export interface RepoStateEvent {
  type: 'state-initialized' | 'state-changed' | 'state-error'
  currentState?: RepoState
  previousState?: RepoState
  diff?: RepoStateDiff
  error?: string
  timestamp: Date
}

export interface RepoStateWatchOptions {
  interval?: number
  includeUntracked?: boolean
  debounceMs?: number
}

export interface EventBus {
  emit(event: string, data: any): void
  on(event: string, callback: (data: any) => void): void
  off(event: string, callback: (data: any) => void): void
}

export interface RepoStateTracker {
  getCurrentState(): Promise<RepoState>
  compareStates(previous: RepoState, current: RepoState): RepoStateDiff
  watchState(callback: (event: RepoStateEvent) => void, options?: RepoStateWatchOptions): void
  stopWatching(): void
  getLastSnapshot(state: RepoState): { changeId: string; timestamp: Date; description: string } | null
  isCleanState(state: RepoState): boolean
}

export class RepoStateError extends Error {
  public override readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'RepoStateError'
    this.cause = cause
  }
}

const CACHE_TTL_MS = 1000 // 1 second cache
const DEFAULT_POLL_INTERVAL = 2000 // 2 seconds

export function createRepoStateTracker(
  jjWrapper: JJWrapper,
  eventBus?: EventBus
): RepoStateTracker {

  let cachedState: RepoState | null = null
  let cacheTimestamp = 0
  let watchInterval: Timer | null = null
  let lastWatchedState: RepoState | null = null
  let isWatching = false
  let inFlightStateRequest: Promise<RepoState> | null = null

  async function fetchCurrentState(): Promise<RepoState> {
    // Check if repo exists
    const isRepo = await jjWrapper.isRepo()
    if (!isRepo) {
      throw new RepoStateError('Not a JJ repository')
    }

    // Get basic repo info
    const [
      statusResult,
      currentChangeResult,
      workingCopyResult,
      bookmarksResult,
      conflictsResult,
      rootResult
    ] = await Promise.all([
      jjWrapper.getStatus(),
      jjWrapper.getChangeId('@'),
      jjWrapper.getWorkingCopyChangeId(),
      jjWrapper.listBookmarks(),
      jjWrapper.getConflictedFiles(),
      jjWrapper.getRoot()
    ])

    if (!statusResult.success) {
      throw new RepoStateError(`Failed to get repository status: ${statusResult.error}`)
    }

    if (!currentChangeResult.success) {
      throw new RepoStateError(`Failed to get current change ID: ${currentChangeResult.error}`)
    }

    if (!workingCopyResult.success) {
      throw new RepoStateError(`Failed to get working copy change ID: ${workingCopyResult.error}`)
    }

    // Parse status output for file changes
    const statusOutput = statusResult.output || ''
    const modifiedFiles: string[] = []
    const stagedFiles: string[] = []
    const untrackedFiles: string[] = []

    const statusLines = statusOutput.split('\n')
    for (const line of statusLines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('M ')) {
        modifiedFiles.push(trimmed.substring(2).trim())
      } else if (trimmed.startsWith('A ')) {
        stagedFiles.push(trimmed.substring(2).trim())
      } else if (trimmed.startsWith('? ')) {
        untrackedFiles.push(trimmed.substring(2).trim())
      }
    }

    const conflictedFiles = conflictsResult.success ? (conflictsResult.files || []) : []
    const bookmarks = bookmarksResult.success ?
      (bookmarksResult.bookmarks || []).map(b => b.name) : []

    const hasUncommittedChanges = modifiedFiles.length > 0 || stagedFiles.length > 0
    const hasConflicts = conflictedFiles.length > 0

    const isClean = !hasUncommittedChanges && !hasConflicts

    const state: RepoState = {
      isClean,
      currentChangeId: currentChangeResult.changeId || '',
      workingCopyChangeId: workingCopyResult.changeId || '',
      bookmarks,
      hasUncommittedChanges,
      conflictedFiles,
      untrackedFiles,
      modifiedFiles,
      stagedFiles,
      metadata: {
        lastChecked: new Date(),
        repoRoot: rootResult.success ? (rootResult.root || '') : ''
      }
    }

    return state
  }

  return {
    async getCurrentState(): Promise<RepoState> {
      const now = Date.now()

      // Return cached state if still valid
      if (cachedState && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return cachedState
      }

      // Deduplicate concurrent requests
      if (inFlightStateRequest) {
        return inFlightStateRequest
      }

      inFlightStateRequest = fetchCurrentState()

      try {
        const state = await inFlightStateRequest
        cachedState = state
        cacheTimestamp = now
        return state
      } finally {
        inFlightStateRequest = null
      }
    },

    compareStates(previous: RepoState, current: RepoState): RepoStateDiff {
      const changeDetails: Record<string, any> = {}
      let hasChanges = false

      // Compare scalar fields
      const scalarFields: (keyof RepoState)[] = [
        'isClean', 'currentChangeId', 'workingCopyChangeId', 'hasUncommittedChanges'
      ]

      for (const field of scalarFields) {
        if (previous[field] !== current[field]) {
          changeDetails[field] = { from: previous[field], to: current[field] }
          hasChanges = true
        }
      }

      // Compare array fields
      const arrayFields: (keyof RepoState)[] = [
        'bookmarks', 'conflictedFiles', 'untrackedFiles', 'modifiedFiles', 'stagedFiles'
      ]

      for (const field of arrayFields) {
        const prevArray = (previous[field] as string[]) || []
        const currArray = (current[field] as string[]) || []

        const added = currArray.filter(item => !prevArray.includes(item))
        const removed = prevArray.filter(item => !currArray.includes(item))

        if (added.length > 0 || removed.length > 0) {
          changeDetails[field] = { added, removed }
          hasChanges = true
        }
      }

      // Compare last snapshot
      if (previous['lastSnapshot']?.changeId !== current['lastSnapshot']?.changeId) {
        changeDetails['lastSnapshot'] = {
          from: previous['lastSnapshot']?.changeId,
          to: current['lastSnapshot']?.changeId
        }
        hasChanges = true
      }

      return { hasChanges, changeDetails }
    },

    watchState(
      callback: (event: RepoStateEvent) => void,
      options: RepoStateWatchOptions = {}
    ): void {
      if (isWatching) {
        this.stopWatching()
      }

      const { interval = DEFAULT_POLL_INTERVAL } = options

      isWatching = true

      // Initial state fetch
      this.getCurrentState()
        .then(state => {
          lastWatchedState = state
          const event: RepoStateEvent = {
            type: 'state-initialized',
            currentState: state,
            timestamp: new Date()
          }
          callback(event)

          if (eventBus) {
            eventBus.emit('repo-state-initialized', event)
          }
        })
        .catch(error => {
          const event: RepoStateEvent = {
            type: 'state-error',
            error: error.message,
            timestamp: new Date()
          }
          callback(event)

          if (eventBus) {
            eventBus.emit('repo-state-error', event)
          }
        })

      // Set up polling
      watchInterval = setInterval(async () => {
        if (!isWatching) return

        try {
          const currentState = await this.getCurrentState()

          if (lastWatchedState) {
            const diff = this.compareStates(lastWatchedState, currentState)

            if (diff.hasChanges) {
              const event: RepoStateEvent = {
                type: 'state-changed',
                currentState,
                previousState: lastWatchedState,
                diff,
                timestamp: new Date()
              }
              callback(event)

              if (eventBus) {
                eventBus.emit('repo-state-changed', event)
              }
            }
          }

          lastWatchedState = currentState
        } catch (error) {
          const event: RepoStateEvent = {
            type: 'state-error',
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date()
          }
          callback(event)

          if (eventBus) {
            eventBus.emit('repo-state-error', event)
          }
        }
      }, interval)
    },

    stopWatching(): void {
      isWatching = false
      if (watchInterval) {
        clearInterval(watchInterval)
        watchInterval = null
      }
      lastWatchedState = null
    },

    getLastSnapshot(state: RepoState): { changeId: string; timestamp: Date; description: string } | null {
      return state.lastSnapshot || null
    },

    isCleanState(state: RepoState): boolean {
      return state.isClean &&
             state.conflictedFiles.length === 0 &&
             !state.hasUncommittedChanges
    }
  }
}
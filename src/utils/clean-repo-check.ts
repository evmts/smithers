/**
 * Clean Repository Checker - Validates and ensures repository cleanliness
 * Provides comprehensive repository state validation and cleanup capabilities
 */

import type { JJWrapper } from '../vcs/jj-wrapper.js'
import type { RepoStateTracker, RepoState } from '../vcs/repo-state.js'

export interface RepoCleanState {
  isClean: boolean
  hasUncommittedChanges: boolean
  hasConflicts: boolean
  hasUntrackedFiles: boolean
  modifiedFiles: string[]
  conflictedFiles: string[]
  untrackedFiles: string[]
  stagedFiles: string[]
  bookmarks: string[]
  currentChangeId: string
  workingCopyChangeId: string
}

export interface CleanCheckOptions {
  allowUntracked?: boolean
  strict?: boolean
  ignorePatterns?: string[]
  timeout?: number
}

export interface CleanCheckResult {
  isClean: boolean
  canProceed: boolean
  issues: string[]
  modifiedFiles?: string[]
  conflictedFiles?: string[]
  untrackedFiles?: string[]
  stagedFiles?: string[]
  summary: string
  recommendations: string[]
}

export interface CleanupOptions {
  dryRun?: boolean
  removeUntracked?: boolean
  createBackup?: boolean
  force?: boolean
}

export interface CleanupResult {
  success: boolean
  actions: string[]
  backupChangeId?: string
  error?: string
}

export interface RepoValidationResult {
  isValid: boolean
  issues: string[]
  warnings: string[]
}

export interface DetailedRepoStatus extends RepoCleanState {
  summary: string
  recommendations: string[]
}

export interface CleanRepoChecker {
  checkCleanState(options?: CleanCheckOptions): Promise<CleanCheckResult>
  enforceCleanState(options?: CleanCheckOptions): Promise<void>
  cleanRepository(options?: CleanupOptions): Promise<CleanupResult>
  validateRepoStructure(): Promise<RepoValidationResult>
  getDetailedStatus(): Promise<DetailedRepoStatus>
  waitForCleanState(timeoutMs: number, pollIntervalMs?: number): Promise<void>
}

export class CleanRepoError extends Error {
  public override readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'CleanRepoError'
    if (cause) {
      this.cause = cause
    }
  }
}

export function createCleanRepoChecker(
  jjWrapper: JJWrapper,
  repoStateTracker: RepoStateTracker
): CleanRepoChecker {

  function matchesIgnorePatterns(filePath: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      if (pattern.includes('*')) {
        // Simple glob pattern matching
        const regex = new RegExp(
          pattern.replace(/\*/g, '.*').replace(/\?/g, '.')
        )
        return regex.test(filePath)
      }
      return filePath.includes(pattern)
    })
  }

  function convertRepoState(repoState: RepoState): RepoCleanState {
    return {
      isClean: repoState.isClean,
      hasUncommittedChanges: repoState.hasUncommittedChanges,
      hasConflicts: repoState.conflictedFiles.length > 0,
      hasUntrackedFiles: repoState.untrackedFiles.length > 0,
      modifiedFiles: repoState.modifiedFiles,
      conflictedFiles: repoState.conflictedFiles,
      untrackedFiles: repoState.untrackedFiles,
      stagedFiles: repoState.stagedFiles,
      bookmarks: repoState.bookmarks,
      currentChangeId: repoState.currentChangeId,
      workingCopyChangeId: repoState.workingCopyChangeId
    }
  }

  return {
    async checkCleanState(options: CleanCheckOptions = {}): Promise<CleanCheckResult> {
      try {
        const repoState = await repoStateTracker.getCurrentState()
        const state = convertRepoState(repoState)

        const issues: string[] = []
        let canProceed = true

        // Check for uncommitted changes
        if (state.hasUncommittedChanges) {
          issues.push('Repository has uncommitted changes')
          canProceed = false
        }

        // Check for conflicts
        if (state.hasConflicts) {
          issues.push('Repository has unresolved conflicts')
          canProceed = false
        }

        // Check for untracked files (if not allowed)
        if (state.hasUntrackedFiles && (!options.allowUntracked || options.strict)) {
          let untrackedFiles = state.untrackedFiles

          // Filter by ignore patterns if provided
          if (options.ignorePatterns && options.ignorePatterns.length > 0) {
            untrackedFiles = untrackedFiles.filter(file =>
              !matchesIgnorePatterns(file, options.ignorePatterns!)
            )
          }

          if (untrackedFiles.length > 0) {
            issues.push('Repository has untracked files')
            if (!options.allowUntracked) {
              canProceed = false
            }
          }

          state.untrackedFiles = untrackedFiles
        }

        const isClean = issues.length === 0

        // Generate summary and recommendations
        let summary: string
        const recommendations: string[] = []

        if (isClean) {
          summary = 'Repository is in clean state'
        } else {
          summary = `Repository has ${issues.length} issue${issues.length > 1 ? 's' : ''}`

          if (state.hasUncommittedChanges) {
            recommendations.push('Commit or restore uncommitted changes')
          }
          if (state.hasConflicts) {
            recommendations.push('Resolve conflicts before proceeding')
          }
          if (state.hasUntrackedFiles && !options.allowUntracked) {
            recommendations.push('Add or remove untracked files')
          }
        }

        return {
          isClean,
          canProceed,
          issues,
          modifiedFiles: state.modifiedFiles,
          conflictedFiles: state.conflictedFiles,
          untrackedFiles: state.untrackedFiles,
          stagedFiles: state.stagedFiles,
          summary,
          recommendations
        }
      } catch (error) {
        throw new CleanRepoError(
          `Failed to check clean state: ${error instanceof Error ? error.message : String(error)}`,
          error
        )
      }
    },

    async enforceCleanState(options: CleanCheckOptions = {}): Promise<void> {
      const checkResult = await this.checkCleanState(options)

      if (!checkResult.isClean) {
        const issueList = checkResult.issues.join(', ')
        throw new CleanRepoError(`Repository is not in clean state: ${issueList}`)
      }
    },

    async cleanRepository(options: CleanupOptions = {}): Promise<CleanupResult> {
      try {
        const repoState = await repoStateTracker.getCurrentState()
        const state = convertRepoState(repoState)

        const actions: string[] = []
        let backupChangeId: string | undefined

        // Create backup if requested
        if (options.createBackup && !options.dryRun) {
          try {
            const backupMessage = `Backup before clean - ${new Date().toISOString()}`
            const backupResult = await jjWrapper.execute(['snapshot', '-m', backupMessage])
            if (backupResult.success) {
              const changeIdResult = await jjWrapper.getChangeId('@')
              if (changeIdResult.success) {
                backupChangeId = changeIdResult.changeId
                actions.push('Created backup snapshot')
              }
            }
          } catch {
            actions.push('Failed to create backup snapshot')
          }
        }

        // Handle uncommitted changes
        if (state.hasUncommittedChanges) {
          if (options.dryRun) {
            actions.push('Would restore uncommitted changes')
          } else {
            const restoreResult = await jjWrapper.execute(['restore'])
            if (restoreResult.success) {
              actions.push('Restored uncommitted changes')
            } else {
              throw new Error(`Failed to restore changes: ${restoreResult.error}`)
            }
          }
        }

        // Handle conflicts
        if (state.hasConflicts) {
          if (options.dryRun) {
            actions.push('Would abandon conflicted changeset')
          } else {
            const abandonResult = await jjWrapper.execute(['abandon', '@'])
            if (abandonResult.success) {
              actions.push('Abandoned conflicted changeset')
            } else {
              throw new Error(`Failed to abandon conflicted changeset: ${abandonResult.error}`)
            }
          }
        }

        // Handle untracked files
        if (state.hasUntrackedFiles && options.removeUntracked) {
          if (options.dryRun) {
            actions.push(`Would remove untracked files: ${state.untrackedFiles.join(', ')}`)
          } else {
            const untrackResult = await jjWrapper.execute(['file', 'untrack', ...state.untrackedFiles])
            if (untrackResult.success) {
              actions.push(`Removed ${state.untrackedFiles.length} untracked files`)
            } else {
              actions.push('Failed to remove some untracked files')
            }
          }
        }

        const result: CleanupResult = {
          success: true,
          actions
        }
        if (backupChangeId) {
          result.backupChangeId = backupChangeId
        }
        return result
      } catch (error) {
        return {
          success: false,
          actions: [],
          error: `Failed to clean repository: ${error instanceof Error ? error.message : String(error)}`
        }
      }
    },

    async validateRepoStructure(): Promise<RepoValidationResult> {
      const issues: string[] = []
      const warnings: string[] = []

      try {
        // Check if directory is a JJ repository
        const isRepo = await jjWrapper.isRepo()
        if (!isRepo) {
          issues.push('Directory is not a JJ repository')
          return { isValid: false, issues, warnings }
        }

        // Try basic JJ operations to verify repository health
        try {
          await jjWrapper.execute(['log', '-r', '@', '--limit', '1'])
        } catch (error) {
          issues.push(`Repository validation failed: ${error instanceof Error ? error.message : String(error)}`)
        }

        // Get repository root
        const rootResult = await jjWrapper.getRoot()
        if (!rootResult.success) {
          warnings.push('Unable to determine repository root')
        }

        return {
          isValid: issues.length === 0,
          issues,
          warnings
        }
      } catch (error) {
        issues.push(`Repository structure validation failed: ${error instanceof Error ? error.message : String(error)}`)
        return { isValid: false, issues, warnings }
      }
    },

    async getDetailedStatus(): Promise<DetailedRepoStatus> {
      const repoState = await repoStateTracker.getCurrentState()
      const cleanState = convertRepoState(repoState)

      let summary: string
      const recommendations: string[] = []

      if (cleanState.isClean) {
        summary = 'Repository is in clean state'
      } else {
        const problemCount = [
          cleanState.hasUncommittedChanges,
          cleanState.hasConflicts,
          cleanState.hasUntrackedFiles
        ].filter(Boolean).length

        summary = `Repository has ${problemCount} issue${problemCount > 1 ? 's' : ''}`

        if (cleanState.hasUncommittedChanges) {
          recommendations.push('Commit or restore uncommitted changes')
        }
        if (cleanState.hasConflicts) {
          recommendations.push('Resolve conflicts before proceeding')
        }
        if (cleanState.hasUntrackedFiles) {
          recommendations.push('Add or remove untracked files')
        }
      }

      return {
        ...cleanState,
        summary,
        recommendations
      }
    },

    async waitForCleanState(timeoutMs: number, pollIntervalMs = 1000): Promise<void> {
      const startTime = Date.now()

      while (Date.now() - startTime < timeoutMs) {
        const checkResult = await this.checkCleanState()

        if (checkResult.isClean) {
          return
        }

        await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
      }

      throw new CleanRepoError('Repository did not become clean within timeout')
    }
  }
}
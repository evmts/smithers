import React, { useRef, useCallback } from 'react'
import { useMount, useUnmount } from '../../../src/reconciler/hooks'
import type { SmithersDB } from '../../../src/db'
import type { Commit } from '../../../src/db/types'
import type { ExecFunction } from '../types'
import {
  getWorkingCopyStatus,
  getDiffStats,
  newCommit,
  describeCommit,
  squashCommits,
  undoOperation,
  createBookmark,
  type JJWorkingCopyStatus,
  type JJDiffStats
} from '../utils/jjOperations'
import { validatePreCommit, runCompleteValidation } from '../utils/repoStateValidator'
import { useIterationTimeout } from '../hooks/useIterationTimeout'

interface CommitterProps {
  db: SmithersDB
  executionId: string
  exec: ExecFunction
  agentId?: string
  autoCommit?: boolean
  commitMessage?: string
  timeoutMs?: number
  throttle?: {
    maxCommitsPerMinute: number
    delayBetweenCommits: number
  }
  validation?: {
    checkSensitiveData: boolean
    maxFileSize: number
    requireTests: boolean
    enforceConventionalCommits: boolean
  }
  hooks?: {
    preCommit?: (context: CommitContext) => Promise<boolean>
    postCommit?: (commit: Commit) => Promise<void>
    onValidationFailed?: (issues: any[]) => void
  }
  onCommitComplete?: (commit: Commit) => void
  onError?: (error: Error) => void
  children?: (state: CommitterState) => React.ReactNode
}

interface CommitterState {
  status: 'idle' | 'validating' | 'committing' | 'verifying' | 'completed' | 'failed'
  workingCopyStatus: JJWorkingCopyStatus | null
  diffStats: JJDiffStats | null
  commitMessage: string
  validationIssues: ValidationIssue[]
  commitHistory: Commit[]
  throttleState: {
    commitCount: number
    windowStart: number
    isThrottled: boolean
    nextAllowedCommit: number
  }
  lastCommit: Commit | null
  error: string | null
}

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  type: 'format' | 'content' | 'size' | 'security' | 'policy'
  message: string
  suggestion?: string
  file?: string
  line?: number
}

interface CommitContext {
  workingCopyStatus: JJWorkingCopyStatus
  diffStats: JJDiffStats
  message: string
  files: string[]
  author: string
}

// Validation patterns
const CONVENTIONAL_COMMIT_REGEX = /^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .{1,72}$/
const SENSITIVE_PATTERNS = [
  /password\s*[=:]\s*["'].*["']/gi,
  /api[_-]?key\s*[=:]\s*["'].*["']/gi,
  /secret\s*[=:]\s*["'].*["']/gi,
  /token\s*[=:]\s*["'].*["']/gi,
  /\b[A-Fa-f0-9]{32,}\b/g, // Potential hashes/keys
]

const LARGE_FILE_PATTERNS = [
  /\.(zip|tar|gz|bz2|7z|rar)$/i,
  /\.(exe|dmg|pkg|deb|rpm)$/i,
  /\.(mp4|avi|mov|mkv|wmv)$/i,
  /\.min\.(js|css)$/i,
  /node_modules\//,
  /\.git\//,
]

/**
 * Committer component - handles commit creation with validation and JJ integration
 * Follows project patterns: no useState, useRef for non-reactive state
 */
export function Committer({
  db,
  executionId,
  exec,
  agentId = 'committer',
  autoCommit = false,
  commitMessage = '',
  timeoutMs = 30000, // 30 seconds default
  throttle = { maxCommitsPerMinute: 5, delayBetweenCommits: 5000 },
  validation = {
    checkSensitiveData: true,
    maxFileSize: 1000000, // 1MB
    requireTests: false,
    enforceConventionalCommits: true
  },
  hooks = {},
  onCommitComplete,
  onError,
  children
}: CommitterProps) {
  // Non-reactive state (per project guidelines)
  const stateRef = useRef<CommitterState>({
    status: 'idle',
    workingCopyStatus: null,
    diffStats: null,
    commitMessage: commitMessage,
    validationIssues: [],
    commitHistory: [],
    throttleState: {
      commitCount: 0,
      windowStart: Date.now(),
      isThrottled: false,
      nextAllowedCommit: 0
    },
    lastCommit: null,
    error: null
  })

  const commitInProgress = useRef(false)
  const validationCache = useRef<Map<string, ValidationIssue[]>>(new Map())

  // Throttling support
  const { sleep } = useIterationTimeout(timeoutMs)

  // Check throttling state
  const checkThrottling = useCallback((): boolean => {
    const now = Date.now()
    const windowDuration = 60 * 1000 // 1 minute

    // Reset window if expired
    if (now - stateRef.current.throttleState.windowStart > windowDuration) {
      stateRef.current.throttleState = {
        commitCount: 0,
        windowStart: now,
        isThrottled: false,
        nextAllowedCommit: now
      }
    }

    // Check rate limit
    const isRateThrottled = stateRef.current.throttleState.commitCount >= throttle.maxCommitsPerMinute

    // Check delay throttling
    const isDelayThrottled = now < stateRef.current.throttleState.nextAllowedCommit

    const isThrottled = isRateThrottled || isDelayThrottled
    stateRef.current.throttleState.isThrottled = isThrottled

    return isThrottled
  }, [throttle.maxCommitsPerMinute])

  // Analyze working copy
  const analyzeWorkingCopy = useCallback(async (): Promise<{
    workingCopyStatus: JJWorkingCopyStatus | null
    diffStats: JJDiffStats | null
  }> => {
    try {
      const [workingCopyStatus, diffStats] = await Promise.all([
        getWorkingCopyStatus(exec),
        getDiffStats(exec)
      ])

      stateRef.current.workingCopyStatus = workingCopyStatus
      stateRef.current.diffStats = diffStats

      return { workingCopyStatus, diffStats }

    } catch (error) {
      console.error('Failed to analyze working copy:', error)
      return { workingCopyStatus: null, diffStats: null }
    }
  }, [exec])

  // Validate commit message
  const validateCommitMessage = useCallback((message: string): ValidationIssue[] => {
    const cacheKey = `message:${message}`
    const cached = validationCache.current.get(cacheKey)
    if (cached) return cached

    const issues: ValidationIssue[] = []

    // Check conventional commit format
    if (validation.enforceConventionalCommits && !CONVENTIONAL_COMMIT_REGEX.test(message)) {
      issues.push({
        severity: 'error',
        type: 'format',
        message: 'Commit message must follow conventional commit format',
        suggestion: 'Use format: type(scope): description (e.g., "feat: add user authentication")'
      })
    }

    // Check message length
    const firstLine = message.split('\n')[0]
    if (firstLine.length < 10) {
      issues.push({
        severity: 'error',
        type: 'format',
        message: 'Commit message too short',
        suggestion: 'Provide a more descriptive commit message (at least 10 characters)'
      })
    }

    if (firstLine.length > 72) {
      issues.push({
        severity: 'warning',
        type: 'format',
        message: 'Commit message first line too long',
        suggestion: 'Keep first line under 72 characters'
      })
    }

    // Check for vague descriptions
    const vagueWords = ['fix', 'update', 'change', 'modify', 'improve']
    const isVague = vagueWords.some(word =>
      firstLine.toLowerCase().includes(word) && firstLine.split(' ').length < 4
    )

    if (isVague) {
      issues.push({
        severity: 'warning',
        type: 'content',
        message: 'Commit message is too vague',
        suggestion: 'Be more specific about what was changed and why'
      })
    }

    validationCache.current.set(cacheKey, issues)
    return issues
  }, [validation.enforceConventionalCommits])

  // Validate file changes
  const validateFileChanges = useCallback(async (
    workingCopyStatus: JJWorkingCopyStatus,
    diffStats: JJDiffStats
  ): Promise<ValidationIssue[]> => {
    const issues: ValidationIssue[] = []

    try {
      // Check for large files
      for (const change of workingCopyStatus.changes) {
        if (LARGE_FILE_PATTERNS.some(pattern => pattern.test(change.file))) {
          issues.push({
            severity: 'warning',
            type: 'size',
            message: `Large/binary file detected: ${change.file}`,
            suggestion: 'Consider if this file should be tracked in version control',
            file: change.file
          })
        }
      }

      // Check for sensitive data in diff
      if (validation.checkSensitiveData) {
        try {
          const diffResult = await exec('jj diff')
          const diffContent = diffResult.stdout

          for (const pattern of SENSITIVE_PATTERNS) {
            const matches = diffContent.match(pattern)
            if (matches) {
              issues.push({
                severity: 'error',
                type: 'security',
                message: 'Potential sensitive information detected in changes',
                suggestion: 'Review changes to ensure no secrets, passwords, or keys are included'
              })
              break // Only report once
            }
          }
        } catch (error) {
          issues.push({
            severity: 'warning',
            type: 'content',
            message: 'Could not check diff content for sensitive data',
            suggestion: 'Manually review changes before committing'
          })
        }
      }

      // Check for very large changes
      if (diffStats.insertions + diffStats.deletions > 1000) {
        issues.push({
          severity: 'warning',
          type: 'size',
          message: `Large changeset detected (${diffStats.insertions + diffStats.deletions} lines)`,
          suggestion: 'Consider splitting large changes into smaller, focused commits'
        })
      }

      // Check for missing tests (if required)
      if (validation.requireTests) {
        const hasTestFiles = workingCopyStatus.changes.some(change =>
          change.file.includes('test') || change.file.includes('spec')
        )

        const hasSourceChanges = workingCopyStatus.changes.some(change =>
          change.file.includes('src/') && !change.file.includes('test')
        )

        if (hasSourceChanges && !hasTestFiles) {
          issues.push({
            severity: 'warning',
            type: 'policy',
            message: 'Source code changes without corresponding tests',
            suggestion: 'Add tests for new or modified functionality'
          })
        }
      }

    } catch (error) {
      issues.push({
        severity: 'warning',
        type: 'content',
        message: 'Could not fully validate file changes',
        suggestion: 'Manually review changes before committing'
      })
    }

    return issues
  }, [exec, validation.checkSensitiveData, validation.requireTests])

  // Comprehensive validation
  const validateCommit = useCallback(async (message: string): Promise<ValidationIssue[]> => {
    stateRef.current.status = 'validating'
    const allIssues: ValidationIssue[] = []

    try {
      // Analyze working copy
      const { workingCopyStatus, diffStats } = await analyzeWorkingCopy()

      if (!workingCopyStatus || !diffStats) {
        allIssues.push({
          severity: 'error',
          type: 'content',
          message: 'Could not analyze working copy status',
          suggestion: 'Check repository state and permissions'
        })
        return allIssues
      }

      // Check if there are changes to commit
      if (workingCopyStatus.isClean) {
        allIssues.push({
          severity: 'error',
          type: 'content',
          message: 'No changes to commit',
          suggestion: 'Make changes before attempting to commit'
        })
        return allIssues
      }

      // Validate commit message
      const messageIssues = validateCommitMessage(message)
      allIssues.push(...messageIssues)

      // Validate file changes
      const fileIssues = await validateFileChanges(workingCopyStatus, diffStats)
      allIssues.push(...fileIssues)

      // Repository state validation
      const repoValidation = await validatePreCommit(exec)
      const repoIssues: ValidationIssue[] = repoValidation.issues.map(issue => ({
        severity: issue.severity === 'critical' ? 'error' : 'warning',
        type: 'policy',
        message: issue.message,
        suggestion: issue.suggestion,
        file: issue.affectedFiles?.[0]
      }))
      allIssues.push(...repoIssues)

    } catch (error) {
      allIssues.push({
        severity: 'error',
        type: 'content',
        message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestion: 'Check repository state and try again'
      })
    }

    stateRef.current.validationIssues = allIssues

    if (hooks.onValidationFailed && allIssues.some(i => i.severity === 'error')) {
      hooks.onValidationFailed(allIssues)
    }

    return allIssues
  }, [analyzeWorkingCopy, validateCommitMessage, validateFileChanges, exec, hooks])

  // Create snapshot before commit
  const createPreCommitSnapshot = useCallback(async (message: string): Promise<string | null> => {
    try {
      const snapshotMessage = `Pre-commit snapshot: ${message}`
      const result = await exec(`jj commit -m "${snapshotMessage}"`)

      if (result.exitCode !== 0) {
        throw new Error(`Failed to create snapshot: ${result.stderr}`)
      }

      // Extract commit ID from output
      const commitMatch = result.stdout.match(/Created commit (\S+)/)
      const commitId = commitMatch ? commitMatch[1] : null

      if (commitId) {
        // Log snapshot
        await db.vcs.logSnapshot({
          execution_id: executionId,
          commit_id: commitId,
          change_id: commitId.substring(0, 8),
          message: snapshotMessage,
          type: 'pre_commit',
          metadata: { original_message: message }
        })
      }

      return commitId

    } catch (error) {
      console.error('Failed to create pre-commit snapshot:', error)
      return null
    }
  }, [exec, db, executionId])

  // Execute commit operation
  const executeCommit = useCallback(async (message: string): Promise<Commit> => {
    if (commitInProgress.current) {
      throw new Error('Commit already in progress')
    }

    try {
      commitInProgress.current = true
      stateRef.current.status = 'committing'
      stateRef.current.error = null

      // Check throttling
      if (checkThrottling()) {
        throw new Error('Commit rate limit exceeded - please wait before committing')
      }

      // Validate commit
      const validationIssues = await validateCommit(message)
      const hasErrors = validationIssues.some(i => i.severity === 'error')

      if (hasErrors) {
        throw new Error(`Commit validation failed: ${validationIssues.filter(i => i.severity === 'error').map(i => i.message).join(', ')}`)
      }

      // Get current state
      const { workingCopyStatus, diffStats } = await analyzeWorkingCopy()
      if (!workingCopyStatus || !diffStats) {
        throw new Error('Cannot analyze working copy for commit')
      }

      // Create commit context for hooks
      const commitContext: CommitContext = {
        workingCopyStatus,
        diffStats,
        message,
        files: workingCopyStatus.changes.map(c => c.file),
        author: 'smithers-committer@ai.com'
      }

      // Run pre-commit hook
      if (hooks.preCommit) {
        const shouldProceed = await hooks.preCommit(commitContext)
        if (!shouldProceed) {
          throw new Error('Pre-commit hook prevented commit')
        }
      }

      // Create pre-commit snapshot
      const snapshotId = await createPreCommitSnapshot(message)

      // Execute commit
      const result = await exec(`jj commit -m "${message}"`)

      if (result.exitCode !== 0) {
        throw new Error(`Commit failed: ${result.stderr}`)
      }

      // Extract commit information
      const commitMatch = result.stdout.match(/Created commit (\S+)/)
      const changeMatch = result.stdout.match(/Change ID: (\S+)/)

      const commitId = commitMatch ? commitMatch[1] : `commit-${Date.now()}`
      const changeId = changeMatch ? changeMatch[1] : commitId.substring(0, 8)

      // Create commit record
      const commit: Commit = {
        id: `commit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        execution_id: executionId,
        agent_id: agentId,
        change_id: changeId,
        commit_id: commitId,
        message,
        author: commitContext.author,
        timestamp: new Date(),
        files_changed: commitContext.files,
        insertions: diffStats.insertions,
        deletions: diffStats.deletions,
        parent_commits: workingCopyStatus.parent ? [workingCopyStatus.parent] : [],
        created_at: new Date()
      }

      // Log commit to database
      await db.vcs.logCommit(commit)

      // Post-commit verification
      stateRef.current.status = 'verifying'

      try {
        const postValidation = await runCompleteValidation(exec)
        if (!postValidation.isValid) {
          const criticalIssues = postValidation.issues.filter(i => i.severity === 'critical')
          if (criticalIssues.length > 0) {
            console.warn('Post-commit validation found critical issues, but commit has already been made:', criticalIssues)
          }
        }
      } catch (error) {
        console.warn('Post-commit validation failed:', error)
        // Don't fail the commit for validation errors
      }

      // Update throttle state
      stateRef.current.throttleState.commitCount++
      stateRef.current.throttleState.nextAllowedCommit = Date.now() + throttle.delayBetweenCommits

      // Update state
      stateRef.current.lastCommit = commit
      stateRef.current.commitHistory.push(commit)
      stateRef.current.status = 'completed'

      // Run post-commit hook
      if (hooks.postCommit) {
        try {
          await hooks.postCommit(commit)
        } catch (error) {
          console.error('Post-commit hook failed:', error)
          // Don't fail the commit for hook errors
        }
      }

      // Notify completion
      if (onCommitComplete) {
        onCommitComplete(commit)
      }

      return commit

    } catch (error) {
      stateRef.current.status = 'failed'
      const errorMessage = error instanceof Error ? error.message : 'Commit failed'
      stateRef.current.error = errorMessage

      if (onError) {
        onError(error instanceof Error ? error : new Error(errorMessage))
      }

      throw error

    } finally {
      commitInProgress.current = false
    }
  }, [
    checkThrottling,
    validateCommit,
    analyzeWorkingCopy,
    hooks,
    createPreCommitSnapshot,
    exec,
    executionId,
    agentId,
    db,
    throttle.delayBetweenCommits,
    onCommitComplete,
    onError
  ])

  // Update commit message
  const updateCommitMessage = useCallback((message: string) => {
    stateRef.current.commitMessage = message
    validationCache.current.clear() // Clear cache when message changes
  }, [])

  // Generate commit message
  const generateCommitMessage = useCallback(async (): Promise<string> => {
    try {
      const { workingCopyStatus, diffStats } = await analyzeWorkingCopy()

      if (!workingCopyStatus || !diffStats) {
        return 'chore: update files'
      }

      // Analyze changes to suggest commit type
      const files = workingCopyStatus.changes.map(c => c.file)
      const hasTests = files.some(f => f.includes('test') || f.includes('spec'))
      const hasDocs = files.some(f => f.includes('README') || f.includes('.md'))
      const hasSource = files.some(f => f.includes('src/') || f.includes('lib/'))

      let type = 'chore'
      if (hasTests && !hasSource) {
        type = 'test'
      } else if (hasDocs && !hasSource) {
        type = 'docs'
      } else if (hasSource) {
        type = 'feat' // Default to feat for source changes
      }

      // Generate description based on files
      const primaryFile = files[0]
      const fileCount = files.length

      let description = `update ${primaryFile}`
      if (fileCount > 1) {
        description = `update ${fileCount} files`
      }

      return `${type}: ${description}`

    } catch (error) {
      return 'chore: update files'
    }
  }, [analyzeWorkingCopy])

  // Amend last commit
  const amendCommit = useCallback(async (newMessage?: string): Promise<Commit | null> => {
    try {
      if (!stateRef.current.lastCommit) {
        throw new Error('No recent commit to amend')
      }

      const message = newMessage || stateRef.current.lastCommit.message

      // Use JJ describe to amend
      const result = await exec(`jj describe -m "${message}"`)

      if (result.exitCode !== 0) {
        throw new Error(`Failed to amend commit: ${result.stderr}`)
      }

      // Update last commit record
      const amendedCommit: Commit = {
        ...stateRef.current.lastCommit,
        message,
        timestamp: new Date()
      }

      await db.vcs.logCommit(amendedCommit)

      stateRef.current.lastCommit = amendedCommit

      return amendedCommit

    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error : new Error('Amend failed'))
      }
      return null
    }
  }, [exec, db, onError])

  // Component lifecycle
  useMount(() => {
    // Initial analysis
    analyzeWorkingCopy()

    // Auto-commit if enabled and message provided
    if (autoCommit && stateRef.current.commitMessage) {
      executeCommit(stateRef.current.commitMessage)
    }
  })

  useUnmount(() => {
    validationCache.current.clear()
  })

  // Return interface for programmatic control
  const committerInterface = {
    executeCommit,
    amendCommit,
    updateCommitMessage,
    generateCommitMessage,
    validateCommit,
    analyzeWorkingCopy,
    get state() { return stateRef.current },
    get isCommitting() { return commitInProgress.current },
    get canCommit() {
      return !commitInProgress.current &&
             !stateRef.current.throttleState.isThrottled &&
             stateRef.current.commitMessage.length > 0
    }
  }

  // Render function
  if (children) {
    return children(stateRef.current)
  }

  // Default render
  return (
    <div>
      <div>Status: {stateRef.current.status}</div>

      {stateRef.current.workingCopyStatus && (
        <div>
          <div>Working Copy:</div>
          <div>Clean: {stateRef.current.workingCopyStatus.isClean ? 'Yes' : 'No'}</div>
          <div>Changes: {stateRef.current.workingCopyStatus.changes.length}</div>
        </div>
      )}

      {stateRef.current.diffStats && (
        <div>
          <div>Changes:</div>
          <div>Files: {stateRef.current.diffStats.files}</div>
          <div>Insertions: +{stateRef.current.diffStats.insertions}</div>
          <div>Deletions: -{stateRef.current.diffStats.deletions}</div>
        </div>
      )}

      <div>
        <div>Commit Message:</div>
        <div>{stateRef.current.commitMessage || '(no message)'}</div>
      </div>

      {stateRef.current.validationIssues.length > 0 && (
        <div>
          <div>Validation Issues:</div>
          {stateRef.current.validationIssues.map((issue, index) => (
            <div key={index}>
              <div>{issue.severity}: {issue.message}</div>
              {issue.suggestion && <div>💡 {issue.suggestion}</div>}
            </div>
          ))}
        </div>
      )}

      {stateRef.current.throttleState.isThrottled && (
        <div>⚠️ Commit operations are throttled due to rate limits</div>
      )}

      {stateRef.current.lastCommit && (
        <div>
          <div>Last Commit:</div>
          <div>ID: {stateRef.current.lastCommit.commit_id}</div>
          <div>Message: {stateRef.current.lastCommit.message}</div>
          <div>Files: {stateRef.current.lastCommit.files_changed.length}</div>
        </div>
      )}

      {stateRef.current.error && (
        <div>❌ Error: {stateRef.current.error}</div>
      )}
    </div>
  )
}

export type { CommitterProps, CommitterState, ValidationIssue, CommitContext }
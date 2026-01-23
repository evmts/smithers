import type { ExecFunction } from '../types'
import {
  getWorkingCopyStatus,
  getConflicts,
  getCommitInfo,
  type JJWorkingCopyStatus,
  type JJConflict
} from './jjOperations'

/**
 * Repository state validation utilities for JJ repositories
 * Provides comprehensive validation for merge/rebase operations
 */

// Validation result types
export interface ValidationResult {
  isValid: boolean
  issues: ValidationIssue[]
  warnings: ValidationWarning[]
}

export interface ValidationIssue {
  severity: 'critical' | 'error' | 'warning'
  type: 'conflict' | 'uncommitted_changes' | 'detached_head' | 'corrupted_index' | 'invalid_state' | 'permission_error'
  message: string
  suggestion?: string
  affectedFiles?: string[]
  context?: Record<string, any>
}

export interface ValidationWarning {
  type: 'performance' | 'best_practice' | 'compatibility' | 'security'
  message: string
  suggestion: string
  severity?: 'low' | 'medium' | 'high'
}

export interface RepoState {
  isClean: boolean
  hasUncommittedChanges: boolean
  hasConflicts: boolean
  currentCommit: string | null
  branchName: string | null
  uncommittedFiles: string[]
  conflictedFiles: string[]
  workingCopyStatus: JJWorkingCopyStatus | null
  conflicts: JJConflict[]
}

// Sensitive patterns that shouldn't be committed
const SENSITIVE_PATTERNS = [
  /password\s*[=:]\s*["'].*["']/gi,
  /api[_-]?key\s*[=:]\s*["'].*["']/gi,
  /secret\s*[=:]\s*["'].*["']/gi,
  /token\s*[=:]\s*["'].*["']/gi,
  /private[_-]?key\s*[=:]\s*["'].*["']/gi,
  /access[_-]?token\s*[=:]\s*["'].*["']/gi,
  /\b[A-Za-z0-9]{32,}\b/g, // Potential hashes/keys
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/g,
  /mongodb:\/\/[^\/]*:[^\/]*@/gi,
  /postgres:\/\/[^\/]*:[^\/]*@/gi,
  /mysql:\/\/[^\/]*:[^\/]*@/gi
]

// Large file patterns
const LARGE_FILE_PATTERNS = [
  /\.(zip|tar|gz|bz2|7z|rar)$/i,
  /\.(exe|dmg|pkg|deb|rpm)$/i,
  /\.(mp4|avi|mov|mkv|wmv)$/i,
  /\.(jpg|jpeg|png|gif|bmp|tiff)$/i,
  /\.(pdf|doc|docx|ppt|pptx)$/i,
  /node_modules\//,
  /\.git\//,
  /build\//,
  /dist\//,
  /target\//
]

// Basic Repository State Validation
export async function validateRepoState(exec: ExecFunction): Promise<RepoState> {
  try {
    const workingCopyStatus = await getWorkingCopyStatus(exec)
    const conflicts = await getConflicts(exec)

    if (!workingCopyStatus) {
      throw new Error('Failed to get repository status')
    }

    const isClean = workingCopyStatus.isClean
    const hasUncommittedChanges = !isClean && workingCopyStatus.changes.length > 0
    const hasConflicts = conflicts.length > 0

    const uncommittedFiles = workingCopyStatus.changes.map(c => c.file)
    const conflictedFiles = conflicts.map(c => c.file)

    return {
      isClean,
      hasUncommittedChanges,
      hasConflicts,
      currentCommit: workingCopyStatus.parent,
      branchName: null, // JJ doesn't have traditional branches
      uncommittedFiles,
      conflictedFiles,
      workingCopyStatus,
      conflicts
    }
  } catch (error) {
    throw new Error(`Failed to validate repository state: ${error}`)
  }
}

// Repository Integrity Validation
export async function validateRepositoryIntegrity(exec: ExecFunction): Promise<ValidationResult> {
  const issues: ValidationIssue[] = []
  const warnings: ValidationWarning[] = []

  try {
    // Check basic repository operations
    const statusResult = await exec('jj status')

    if (statusResult.exitCode !== 0) {
      if (statusResult.stderr.includes('corrupted') || statusResult.stderr.includes('inconsistent')) {
        issues.push({
          severity: 'critical',
          type: 'corrupted_index',
          message: 'Repository is corrupted or in inconsistent state',
          suggestion: 'Run repository repair tools or restore from backup',
          context: { error: statusResult.stderr }
        })
      } else if (statusResult.stderr.includes('permission') || statusResult.stderr.includes('access')) {
        issues.push({
          severity: 'error',
          type: 'permission_error',
          message: 'Insufficient permissions to access repository',
          suggestion: 'Check file permissions and repository access rights',
          context: { error: statusResult.stderr }
        })
      } else {
        issues.push({
          severity: 'error',
          type: 'invalid_state',
          message: `Repository status check failed: ${statusResult.stderr}`,
          suggestion: 'Check repository setup and permissions'
        })
      }
    }

    // Verify commit history accessibility
    try {
      const logResult = await exec('jj log -l 1')

      if (logResult.exitCode !== 0) {
        issues.push({
          severity: 'error',
          type: 'corrupted_index',
          message: 'Cannot read commit history',
          suggestion: 'Repository history may be corrupted - consider recovery options',
          context: { error: logResult.stderr }
        })
      }
    } catch (error) {
      warnings.push({
        type: 'compatibility',
        message: 'Could not verify commit history',
        suggestion: 'Manually check repository log functionality',
        severity: 'medium'
      })
    }

    // Check workspace permissions
    try {
      const testResult = await exec('jj log -r @ --template "{commit_id}"')

      if (testResult.exitCode !== 0) {
        issues.push({
          severity: 'error',
          type: 'permission_error',
          message: 'Cannot read from repository',
          suggestion: 'Check file permissions and repository access',
          context: { error: testResult.stderr }
        })
      }
    } catch (error) {
      issues.push({
        severity: 'critical',
        type: 'invalid_state',
        message: 'Cannot execute repository operations',
        suggestion: 'Check repository setup and permissions',
        context: { error: String(error) }
      })
    }

  } catch (error) {
    issues.push({
      severity: 'critical',
      type: 'invalid_state',
      message: `Failed to validate repository integrity: ${error}`,
      suggestion: 'Check repository permissions and integrity'
    })
  }

  return {
    isValid: issues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
    issues,
    warnings
  }
}

// Conflict Detection and Validation
export async function detectConflicts(exec: ExecFunction): Promise<ValidationResult> {
  const issues: ValidationIssue[] = []
  const warnings: ValidationWarning[] = []

  try {
    const conflicts = await getConflicts(exec)

    if (conflicts.length > 0) {
      const conflictedFiles = conflicts.map(c => c.file)

      issues.push({
        severity: 'error',
        type: 'conflict',
        message: `Found ${conflicts.length} conflicted files`,
        suggestion: 'Resolve conflicts before proceeding with merge/rebase operations',
        affectedFiles: conflictedFiles,
        context: { conflicts }
      })

      // Analyze conflict complexity
      const complexConflicts = conflicts.filter(c => c.sides.length > 2)
      if (complexConflicts.length > 0) {
        warnings.push({
          type: 'best_practice',
          message: `${complexConflicts.length} multi-way conflicts detected`,
          suggestion: 'Multi-way conflicts may require careful manual resolution',
          severity: 'high'
        })
      }
    }

    // Check for conflict markers in files (in case auto-detection missed them)
    const statusResult = await getWorkingCopyStatus(exec)
    if (statusResult && statusResult.changes.length > 0) {
      for (const change of statusResult.changes) {
        if (change.status === 'M') {
          try {
            const diffResult = await exec(`jj diff --no-pager ${change.file}`)
            if (diffResult.stdout.includes('<<<<<<< ') || diffResult.stdout.includes('>>>>>>> ')) {
              warnings.push({
                type: 'best_practice',
                message: `Conflict markers detected in ${change.file}`,
                suggestion: 'Manually verify all conflicts are resolved',
                severity: 'high'
              })
            }
          } catch {
            // Ignore diff errors for individual files
          }
        }
      }
    }

  } catch (error) {
    warnings.push({
      type: 'compatibility',
      message: 'Could not check for conflicts',
      suggestion: 'Manually verify no conflicts exist',
      severity: 'medium'
    })
  }

  return {
    isValid: issues.length === 0,
    issues,
    warnings
  }
}

// Pre-operation Validation
export async function validatePreMerge(
  exec: ExecFunction,
  sourceBranch: string,
  targetBranch: string
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = []
  const warnings: ValidationWarning[] = []

  try {
    // Check repository is in clean state
    const repoState = await validateRepoState(exec)

    if (!repoState.isClean) {
      issues.push({
        severity: 'error',
        type: 'uncommitted_changes',
        message: 'Working copy has uncommitted changes',
        suggestion: 'Commit or stash changes before merge',
        affectedFiles: repoState.uncommittedFiles,
        context: { changes: repoState.workingCopyStatus?.changes }
      })
    }

    // Check for existing conflicts
    const conflictCheck = await detectConflicts(exec)
    if (!conflictCheck.isValid) {
      issues.push(...conflictCheck.issues)
    }

    // Verify source and target exist
    try {
      const sourceInfo = await getCommitInfo(exec, sourceBranch)
      if (!sourceInfo) {
        issues.push({
          severity: 'error',
          type: 'invalid_state',
          message: `Source branch/commit '${sourceBranch}' does not exist`,
          suggestion: 'Check branch/commit identifier'
        })
      }

      const targetInfo = await getCommitInfo(exec, targetBranch)
      if (!targetInfo) {
        issues.push({
          severity: 'error',
          type: 'invalid_state',
          message: `Target branch/commit '${targetBranch}' does not exist`,
          suggestion: 'Check branch/commit identifier'
        })
      }
    } catch (error) {
      warnings.push({
        type: 'compatibility',
        message: 'Could not verify branch/commit references',
        suggestion: 'Manually verify source and target exist',
        severity: 'medium'
      })
    }

    // Check if merge would create conflicts (dry run)
    try {
      const dryRunResult = await exec(`jj new ${targetBranch} ${sourceBranch} --merge --dry-run`)
      if (dryRunResult.exitCode !== 0 && dryRunResult.stderr.includes('conflict')) {
        warnings.push({
          type: 'best_practice',
          message: 'Merge may create conflicts',
          suggestion: 'Review potential conflicts and prepare resolution strategy',
          severity: 'medium'
        })
      }
    } catch {
      // Dry run not supported or failed - this is non-critical
    }

  } catch (error) {
    issues.push({
      severity: 'error',
      type: 'invalid_state',
      message: `Pre-merge validation failed: ${error}`,
      suggestion: 'Check repository state and permissions'
    })
  }

  return {
    isValid: issues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
    issues,
    warnings
  }
}

export async function validatePreRebase(
  exec: ExecFunction,
  source: string,
  destination: string
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = []
  const warnings: ValidationWarning[] = []

  try {
    // Check working copy is clean
    const repoState = await validateRepoState(exec)

    if (!repoState.isClean) {
      issues.push({
        severity: 'error',
        type: 'uncommitted_changes',
        message: 'Cannot rebase with uncommitted changes',
        suggestion: 'Commit changes before rebasing',
        affectedFiles: repoState.uncommittedFiles
      })
    }

    // Check for existing conflicts
    if (repoState.hasConflicts) {
      issues.push({
        severity: 'error',
        type: 'conflict',
        message: 'Existing conflicts must be resolved before rebase',
        suggestion: 'Resolve all conflicts before attempting rebase',
        affectedFiles: repoState.conflictedFiles
      })
    }

    // Verify source and destination exist
    try {
      const sourceResult = await exec(`jj log -r ${source} -l 1`)
      if (sourceResult.exitCode !== 0) {
        issues.push({
          severity: 'error',
          type: 'invalid_state',
          message: `Source revision '${source}' does not exist`,
          suggestion: 'Check revision identifier',
          context: { source, error: sourceResult.stderr }
        })
      }

      const destResult = await exec(`jj log -r ${destination} -l 1`)
      if (destResult.exitCode !== 0) {
        issues.push({
          severity: 'error',
          type: 'invalid_state',
          message: `Destination revision '${destination}' does not exist`,
          suggestion: 'Check revision identifier',
          context: { destination, error: destResult.stderr }
        })
      }
    } catch (error) {
      warnings.push({
        type: 'compatibility',
        message: 'Could not verify revision references',
        suggestion: 'Manually verify source and destination exist',
        severity: 'medium'
      })
    }

    // Check for potential rebase conflicts
    try {
      const dryRunResult = await exec(`jj rebase -s ${source} -d ${destination} --dry-run`)
      if (dryRunResult.exitCode !== 0) {
        warnings.push({
          type: 'best_practice',
          message: 'Rebase may encounter conflicts',
          suggestion: 'Be prepared to resolve conflicts during rebase',
          severity: 'medium'
        })
      }
    } catch {
      // Dry run might not be supported
    }

  } catch (error) {
    issues.push({
      severity: 'error',
      type: 'invalid_state',
      message: `Pre-rebase validation failed: ${error}`,
      suggestion: 'Check repository state and permissions'
    })
  }

  return {
    isValid: issues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
    issues,
    warnings
  }
}

export async function validatePreCommit(exec: ExecFunction): Promise<ValidationResult> {
  const issues: ValidationIssue[] = []
  const warnings: ValidationWarning[] = []

  try {
    // Check for staged/modified files
    const repoState = await validateRepoState(exec)

    if (!repoState.hasUncommittedChanges) {
      warnings.push({
        type: 'best_practice',
        message: 'No changes to commit',
        suggestion: 'Make changes before attempting to commit',
        severity: 'low'
      })
    }

    // Check for large files
    if (repoState.hasUncommittedChanges) {
      try {
        const diffStatResult = await exec('jj diff --stat')
        const lines = diffStatResult.stdout.split('\n')

        lines.forEach(line => {
          const match = line.match(/(\S+)\s*\|\s*(\d+)\s*[+\-]+/)
          if (match) {
            const fileName = match[1]
            const changes = parseInt(match[2])

            // Check for very large changes
            if (changes > 1000) {
              warnings.push({
                type: 'performance',
                message: `Large file change detected: ${fileName} (${changes} lines)`,
                suggestion: 'Consider splitting large changes into smaller commits',
                severity: 'medium'
              })
            }

            // Check for potentially problematic file patterns
            if (LARGE_FILE_PATTERNS.some(pattern => pattern.test(fileName))) {
              warnings.push({
                type: 'best_practice',
                message: `Large/binary file detected: ${fileName}`,
                suggestion: 'Consider if binary files should be tracked in version control',
                severity: 'medium'
              })
            }
          }
        })

        // Check for sensitive information in diff
        const diffResult = await exec('jj diff')
        const diffContent = diffResult.stdout

        for (const pattern of SENSITIVE_PATTERNS) {
          const matches = diffContent.match(pattern)
          if (matches) {
            issues.push({
              severity: 'warning',
              type: 'invalid_state',
              message: 'Potential sensitive information detected in commit',
              suggestion: 'Review changes to ensure no secrets, passwords, or keys are included',
              context: { matches: matches.length }
            })
            break // Only report once
          }
        }

      } catch (error) {
        warnings.push({
          type: 'compatibility',
          message: 'Could not analyze commit contents',
          suggestion: 'Manually review changes before committing',
          severity: 'low'
        })
      }
    }

  } catch (error) {
    warnings.push({
      type: 'compatibility',
      message: 'Pre-commit validation encountered errors',
      suggestion: 'Manually verify commit readiness',
      severity: 'medium'
    })
  }

  return {
    isValid: true, // Pre-commit validation rarely blocks completely
    issues,
    warnings
  }
}

// Post-operation Validation
export async function validatePostMerge(
  exec: ExecFunction,
  expectedResult?: string
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = []
  const warnings: ValidationWarning[] = []

  try {
    // Check merge completed successfully
    const repoState = await validateRepoState(exec)

    // Verify working copy is clean after merge
    if (!repoState.isClean) {
      issues.push({
        severity: 'error',
        type: 'uncommitted_changes',
        message: 'Working copy is not clean after merge',
        suggestion: 'Merge may not have completed successfully - check repository state',
        affectedFiles: repoState.uncommittedFiles
      })
    }

    // Check for remaining conflicts
    if (repoState.hasConflicts) {
      issues.push({
        severity: 'critical',
        type: 'conflict',
        message: 'Conflicts remain after merge',
        suggestion: 'Merge was not completed properly - resolve conflicts and recommit',
        affectedFiles: repoState.conflictedFiles
      })
    }

    // Verify expected result if provided
    if (expectedResult && repoState.currentCommit) {
      if (repoState.currentCommit !== expectedResult) {
        warnings.push({
          type: 'compatibility',
          message: 'Merge result differs from expected',
          suggestion: 'Verify merge was completed as intended',
          severity: 'medium'
        })
      }
    }

    // Check that we can still perform basic operations
    try {
      const statusResult = await exec('jj status')
      if (statusResult.exitCode !== 0) {
        issues.push({
          severity: 'error',
          type: 'invalid_state',
          message: 'Repository operations failing after merge',
          suggestion: 'Merge may have corrupted repository state'
        })
      }
    } catch (error) {
      issues.push({
        severity: 'critical',
        type: 'invalid_state',
        message: 'Cannot perform basic operations after merge',
        suggestion: 'Repository may be in corrupted state - consider rollback'
      })
    }

  } catch (error) {
    issues.push({
      severity: 'error',
      type: 'invalid_state',
      message: `Post-merge validation failed: ${error}`,
      suggestion: 'Check repository state after merge operation'
    })
  }

  return {
    isValid: issues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
    issues,
    warnings
  }
}

// Performance and Health Checks
export async function checkRepositoryPerformance(exec: ExecFunction): Promise<ValidationResult> {
  const issues: ValidationIssue[] = []
  const warnings: ValidationWarning[] = []

  try {
    // Check repository operation performance
    const operationStart = Date.now()

    try {
      await exec('jj status')
    } catch (error) {
      issues.push({
        severity: 'critical',
        type: 'invalid_state',
        message: 'Cannot execute basic repository operations',
        suggestion: 'Repository may be corrupted or inaccessible'
      })
      return { isValid: false, issues, warnings }
    }

    const operationTime = Date.now() - operationStart

    if (operationTime > 5000) { // 5 seconds
      warnings.push({
        type: 'performance',
        message: `Slow repository operations detected (${operationTime}ms)`,
        suggestion: 'Repository may benefit from optimization or cleanup',
        severity: 'medium'
      })
    }

    // Check for very deep commit history
    try {
      const logResult = await exec('jj log -l 1000 --template "{commit_id}\n"')
      const commitCount = logResult.stdout.trim().split('\n').filter(line => line.length > 0).length

      if (commitCount === 1000) { // Hit limit, possibly more
        warnings.push({
          type: 'performance',
          message: 'Very large commit history detected',
          suggestion: 'Consider repository archiving strategies for old history',
          severity: 'low'
        })
      }
    } catch {
      // Ignore if log fails
    }

    // Check working copy file count
    const repoState = await validateRepoState(exec)
    if (repoState.uncommittedFiles.length > 100) {
      warnings.push({
        type: 'performance',
        message: `Large number of uncommitted files (${repoState.uncommittedFiles.length})`,
        suggestion: 'Consider committing changes in smaller batches',
        severity: 'medium'
      })
    }

  } catch (error) {
    warnings.push({
      type: 'performance',
      message: 'Could not measure repository performance',
      suggestion: 'Monitor repository operation times manually',
      severity: 'low'
    })
  }

  return {
    isValid: true, // Performance issues don't invalidate repository
    issues,
    warnings
  }
}

export async function validateWorkspaceHealth(exec: ExecFunction): Promise<ValidationResult> {
  const issues: ValidationIssue[] = []
  const warnings: ValidationWarning[] = []

  try {
    // Check workspace permissions and accessibility
    try {
      const testResult = await exec('jj log -r @ --template "{commit_id}"')

      if (testResult.exitCode !== 0) {
        issues.push({
          severity: 'error',
          type: 'permission_error',
          message: 'Cannot read from repository',
          suggestion: 'Check file permissions and repository access',
          context: { error: testResult.stderr }
        })
      }
    } catch (error) {
      issues.push({
        severity: 'critical',
        type: 'permission_error',
        message: 'Cannot execute repository operations',
        suggestion: 'Check repository setup and permissions',
        context: { error: String(error) }
      })
    }

    // Check for workspace-specific issues
    try {
      const workspaceResult = await exec('jj workspace list')

      if (workspaceResult.exitCode === 0) {
        const workspaces = workspaceResult.stdout.split('\n').filter(line => line.trim())

        if (workspaces.length > 10) {
          warnings.push({
            type: 'performance',
            message: `Many workspaces detected (${workspaces.length})`,
            suggestion: 'Consider cleaning up unused workspaces',
            severity: 'low'
          })
        }
      }
    } catch {
      // Workspace commands might not be available
    }

    // Check disk space (if possible)
    try {
      const dfResult = await exec('df -h .')
      const lines = dfResult.stdout.split('\n')
      const usageLine = lines.find(line => line.includes('%'))

      if (usageLine) {
        const match = usageLine.match(/(\d+)%/)
        if (match) {
          const usage = parseInt(match[1])
          if (usage > 90) {
            warnings.push({
              type: 'performance',
              message: `Low disk space detected (${usage}% used)`,
              suggestion: 'Free up disk space to ensure smooth repository operations',
              severity: 'high'
            })
          }
        }
      }
    } catch {
      // Ignore if df command not available or fails
    }

  } catch (error) {
    warnings.push({
      type: 'compatibility',
      message: 'Could not complete workspace health check',
      suggestion: 'Manually verify workspace accessibility and permissions',
      severity: 'medium'
    })
  }

  return {
    isValid: issues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
    issues,
    warnings
  }
}

// Comprehensive Validation Suite
export async function runCompleteValidation(exec: ExecFunction): Promise<ValidationResult> {
  const allIssues: ValidationIssue[] = []
  const allWarnings: ValidationWarning[] = []

  try {
    // Basic repository integrity
    const integrityCheck = await validateRepositoryIntegrity(exec)
    allIssues.push(...integrityCheck.issues)
    allWarnings.push(...integrityCheck.warnings)

    // If repository is severely compromised, skip other checks
    const hasCriticalIssues = integrityCheck.issues.some(i => i.severity === 'critical')
    if (hasCriticalIssues) {
      return {
        isValid: false,
        issues: allIssues,
        warnings: allWarnings
      }
    }

    // Repository state validation
    try {
      const repoState = await validateRepoState(exec)

      if (repoState.hasUncommittedChanges) {
        allWarnings.push({
          type: 'best_practice',
          message: 'Working copy has uncommitted changes',
          suggestion: 'Consider committing or stashing changes',
          severity: 'low'
        })
      }

      if (repoState.hasConflicts) {
        allIssues.push({
          severity: 'error',
          type: 'conflict',
          message: `${repoState.conflicts.length} unresolved conflicts found`,
          suggestion: 'Resolve all conflicts before proceeding with operations',
          affectedFiles: repoState.conflictedFiles
        })
      }
    } catch (error) {
      allIssues.push({
        severity: 'error',
        type: 'invalid_state',
        message: 'Cannot assess repository state',
        suggestion: 'Check repository accessibility and permissions'
      })
    }

    // Performance check
    const performanceCheck = await checkRepositoryPerformance(exec)
    allWarnings.push(...performanceCheck.warnings)

    // Workspace health
    const workspaceCheck = await validateWorkspaceHealth(exec)
    allIssues.push(...workspaceCheck.issues)
    allWarnings.push(...workspaceCheck.warnings)

  } catch (error) {
    allIssues.push({
      severity: 'critical',
      type: 'invalid_state',
      message: `Complete validation failed: ${error}`,
      suggestion: 'Check repository setup and permissions'
    })
  }

  return {
    isValid: allIssues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
    issues: allIssues,
    warnings: allWarnings
  }
}

// Utility functions
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = []

  if (result.isValid) {
    lines.push('✅ Repository validation passed')
  } else {
    lines.push('❌ Repository validation failed')
  }

  if (result.issues.length > 0) {
    lines.push('\nIssues:')
    result.issues.forEach(issue => {
      const icon = issue.severity === 'critical' ? '🔴' :
                   issue.severity === 'error' ? '🟠' : '🟡'
      lines.push(`  ${icon} ${issue.message}`)
      if (issue.suggestion) {
        lines.push(`     💡 ${issue.suggestion}`)
      }
    })
  }

  if (result.warnings.length > 0) {
    lines.push('\nWarnings:')
    result.warnings.forEach(warning => {
      const icon = warning.severity === 'high' ? '🟡' :
                   warning.severity === 'medium' ? '🔵' : '⚪'
      lines.push(`  ${icon} ${warning.message}`)
      lines.push(`     💡 ${warning.suggestion}`)
    })
  }

  return lines.join('\n')
}

export function isValidationSeverityBlocking(severity: ValidationIssue['severity']): boolean {
  return severity === 'critical' || severity === 'error'
}

export function filterIssuesBySeverity(
  issues: ValidationIssue[],
  severities: ValidationIssue['severity'][]
): ValidationIssue[] {
  return issues.filter(issue => severities.includes(issue.severity))
}

export function groupIssuesByType(issues: ValidationIssue[]): Record<string, ValidationIssue[]> {
  return issues.reduce((groups, issue) => {
    const type = issue.type
    if (!groups[type]) {
      groups[type] = []
    }
    groups[type].push(issue)
    return groups
  }, {} as Record<string, ValidationIssue[]>)
}
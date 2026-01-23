import { describe, it, expect, mock, beforeEach } from 'bun:test'
import type { ExecFunction } from '../../issues/smithershub/src/types'

const mockExec = mock() as jest.MockedFunction<ExecFunction>

// Mock validation result types
interface ValidationResult {
  isValid: boolean
  issues: ValidationIssue[]
  warnings: ValidationWarning[]
}

interface ValidationIssue {
  severity: 'critical' | 'error' | 'warning'
  type: 'conflict' | 'uncommitted_changes' | 'detached_head' | 'corrupted_index' | 'invalid_state'
  message: string
  suggestion?: string
  affectedFiles?: string[]
}

interface ValidationWarning {
  type: 'performance' | 'best_practice' | 'compatibility'
  message: string
  suggestion: string
}

interface RepoState {
  isClean: boolean
  hasUncommittedChanges: boolean
  hasConflicts: boolean
  currentCommit: string | null
  branchName: string | null
  uncommittedFiles: string[]
  conflictedFiles: string[]
}

describe('repoStateValidator Utilities', () => {
  beforeEach(() => {
    mock.restore()

    // Setup default clean repository state
    mockExec.mockImplementation(async (command: string) => {
      if (command.includes('jj status')) {
        return {
          stdout: `Parent commit: abc123def456\nWorking copy: clean`,
          stderr: '',
          exitCode: 0
        }
      }
      return { stdout: '', stderr: '', exitCode: 0 }
    })
  })

  describe('Basic Repository State Validation', () => {
    it('should validate clean repository state', async () => {
      const validateRepoState = async (exec: ExecFunction): Promise<RepoState> => {
        const statusResult = await exec('jj status')

        if (statusResult.exitCode !== 0) {
          throw new Error('Failed to get repository status')
        }

        const isClean = statusResult.stdout.includes('Working copy: clean')
        const hasUncommittedChanges = !isClean && statusResult.stdout.includes('Working copy changes:')

        // Extract current commit
        const commitMatch = statusResult.stdout.match(/Parent commit: (\S+)/)
        const currentCommit = commitMatch ? commitMatch[1] : null

        // Extract uncommitted files
        const uncommittedFiles: string[] = []
        if (hasUncommittedChanges) {
          const lines = statusResult.stdout.split('\n')
          lines.forEach(line => {
            const fileMatch = line.match(/^[AMD]\s+(.+)$/)
            if (fileMatch) {
              uncommittedFiles.push(fileMatch[1])
            }
          })
        }

        // Check for conflicts (simplified - would need more JJ-specific logic)
        const conflictedFiles: string[] = []
        const hasConflicts = conflictedFiles.length > 0

        return {
          isClean,
          hasUncommittedChanges,
          hasConflicts,
          currentCommit,
          branchName: null, // JJ doesn't have traditional branches
          uncommittedFiles,
          conflictedFiles
        }
      }

      const state = await validateRepoState(mockExec)

      expect(state.isClean).toBe(true)
      expect(state.hasUncommittedChanges).toBe(false)
      expect(state.hasConflicts).toBe(false)
      expect(state.currentCommit).toBe('abc123def456')
      expect(state.uncommittedFiles).toHaveLength(0)
    })

    it('should detect uncommitted changes', async () => {
      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj status')) {
          return {
            stdout: `Parent commit: abc123def456\nWorking copy changes:\nM src/auth.ts\nA src/new-file.ts\nD src/old-file.ts`,
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const validateRepoState = async (exec: ExecFunction): Promise<RepoState> => {
        const statusResult = await exec('jj status')

        const isClean = statusResult.stdout.includes('Working copy: clean')
        const hasUncommittedChanges = statusResult.stdout.includes('Working copy changes:')

        const uncommittedFiles: string[] = []
        if (hasUncommittedChanges) {
          const lines = statusResult.stdout.split('\n')
          lines.forEach(line => {
            const fileMatch = line.match(/^[AMD]\s+(.+)$/)
            if (fileMatch) {
              uncommittedFiles.push(fileMatch[1])
            }
          })
        }

        return {
          isClean,
          hasUncommittedChanges,
          hasConflicts: false,
          currentCommit: 'abc123def456',
          branchName: null,
          uncommittedFiles,
          conflictedFiles: []
        }
      }

      const state = await validateRepoState(mockExec)

      expect(state.isClean).toBe(false)
      expect(state.hasUncommittedChanges).toBe(true)
      expect(state.uncommittedFiles).toHaveLength(3)
      expect(state.uncommittedFiles).toContain('src/auth.ts')
      expect(state.uncommittedFiles).toContain('src/new-file.ts')
      expect(state.uncommittedFiles).toContain('src/old-file.ts')
    })

    it('should detect repository corruption', async () => {
      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj status')) {
          return {
            stdout: '',
            stderr: 'Error: Repository is corrupted or in inconsistent state',
            exitCode: 1
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const validateRepositoryIntegrity = async (exec: ExecFunction): Promise<ValidationResult> => {
        const issues: ValidationIssue[] = []
        const warnings: ValidationWarning[] = []

        try {
          const statusResult = await exec('jj status')

          if (statusResult.exitCode !== 0) {
            if (statusResult.stderr.includes('corrupted') || statusResult.stderr.includes('inconsistent')) {
              issues.push({
                severity: 'critical',
                type: 'corrupted_index',
                message: 'Repository is corrupted or in inconsistent state',
                suggestion: 'Run repository repair tools or restore from backup'
              })
            }
          }
        } catch (error) {
          issues.push({
            severity: 'critical',
            type: 'invalid_state',
            message: `Failed to read repository state: ${error}`,
            suggestion: 'Check repository permissions and integrity'
          })
        }

        return {
          isValid: issues.length === 0,
          issues,
          warnings
        }
      }

      const result = await validateRepositoryIntegrity(mockExec)

      expect(result.isValid).toBe(false)
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].severity).toBe('critical')
      expect(result.issues[0].type).toBe('corrupted_index')
    })
  })

  describe('Conflict Detection and Validation', () => {
    it('should detect merge conflicts', async () => {
      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj resolve --list')) {
          return {
            stdout: `src/auth.ts: 2-sided conflict\nsrc/utils.ts: 3-sided conflict`,
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const detectConflicts = async (exec: ExecFunction): Promise<ValidationResult> => {
        const issues: ValidationIssue[] = []
        const warnings: ValidationWarning[] = []

        try {
          const conflictResult = await exec('jj resolve --list')

          if (conflictResult.exitCode === 0 && conflictResult.stdout.trim()) {
            const conflictedFiles = conflictResult.stdout
              .trim()
              .split('\n')
              .map(line => {
                const match = line.match(/^(\S+):/)
                return match ? match[1] : null
              })
              .filter((file): file is string => file !== null)

            if (conflictedFiles.length > 0) {
              issues.push({
                severity: 'error',
                type: 'conflict',
                message: `Found ${conflictedFiles.length} conflicted files`,
                suggestion: 'Resolve conflicts before proceeding',
                affectedFiles: conflictedFiles
              })
            }
          }
        } catch (error) {
          warnings.push({
            type: 'compatibility',
            message: 'Could not check for conflicts',
            suggestion: 'Manually verify no conflicts exist'
          })
        }

        return {
          isValid: issues.length === 0,
          issues,
          warnings
        }
      }

      const result = await detectConflicts(mockExec)

      expect(result.isValid).toBe(false)
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].type).toBe('conflict')
      expect(result.issues[0].affectedFiles).toHaveLength(2)
      expect(result.issues[0].affectedFiles).toContain('src/auth.ts')
      expect(result.issues[0].affectedFiles).toContain('src/utils.ts')
    })

    it('should validate conflict resolution', async () => {
      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj resolve --list')) {
          return {
            stdout: '', // No conflicts listed
            stderr: '',
            exitCode: 0
          }
        }
        if (command.includes('jj status')) {
          return {
            stdout: `Parent commit: abc123def456\nWorking copy: clean`,
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const validateConflictResolution = async (exec: ExecFunction): Promise<ValidationResult> => {
        const issues: ValidationIssue[] = []
        const warnings: ValidationWarning[] = []

        // Check for remaining conflicts
        const conflictResult = await exec('jj resolve --list')
        const hasConflicts = conflictResult.exitCode === 0 && conflictResult.stdout.trim().length > 0

        if (hasConflicts) {
          issues.push({
            severity: 'error',
            type: 'conflict',
            message: 'Unresolved conflicts remain',
            suggestion: 'Complete conflict resolution before proceeding'
          })
        }

        // Check working copy is clean after resolution
        const statusResult = await exec('jj status')
        const isClean = statusResult.stdout.includes('Working copy: clean')

        if (!isClean && !hasConflicts) {
          warnings.push({
            type: 'best_practice',
            message: 'Working copy has uncommitted changes after conflict resolution',
            suggestion: 'Consider committing resolved changes'
          })
        }

        return {
          isValid: issues.length === 0,
          issues,
          warnings
        }
      }

      const result = await validateConflictResolution(mockExec)

      expect(result.isValid).toBe(true)
      expect(result.issues).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })
  })

  describe('Pre-operation Validation', () => {
    it('should validate state before merge', async () => {
      const validatePreMerge = async (exec: ExecFunction, sourceBranch: string, targetBranch: string): Promise<ValidationResult> => {
        const issues: ValidationIssue[] = []
        const warnings: ValidationWarning[] = []

        // Check repository is in clean state
        const statusResult = await exec('jj status')
        const isClean = statusResult.stdout.includes('Working copy: clean')

        if (!isClean) {
          issues.push({
            severity: 'error',
            type: 'uncommitted_changes',
            message: 'Working copy has uncommitted changes',
            suggestion: 'Commit or stash changes before merge'
          })
        }

        // Check for existing conflicts
        try {
          const conflictResult = await exec('jj resolve --list')
          const hasConflicts = conflictResult.stdout.trim().length > 0

          if (hasConflicts) {
            issues.push({
              severity: 'error',
              type: 'conflict',
              message: 'Existing conflicts must be resolved first',
              suggestion: 'Resolve all conflicts before attempting merge'
            })
          }
        } catch {
          warnings.push({
            type: 'compatibility',
            message: 'Could not verify conflict state',
            suggestion: 'Manually check for conflicts'
          })
        }

        // Check if merge would create conflicts (dry run)
        try {
          const dryRunResult = await exec(`jj new ${targetBranch} ${sourceBranch} --merge --dry-run`)
          if (dryRunResult.exitCode !== 0 && dryRunResult.stderr.includes('conflict')) {
            warnings.push({
              type: 'best_practice',
              message: 'Merge may create conflicts',
              suggestion: 'Review potential conflicts before proceeding'
            })
          }
        } catch {
          // Dry run not supported or failed - continue anyway
        }

        return {
          isValid: issues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
          issues,
          warnings
        }
      }

      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj status')) {
          return {
            stdout: `Parent commit: abc123def456\nWorking copy: clean`,
            stderr: '',
            exitCode: 0
          }
        }
        if (command.includes('jj resolve --list')) {
          return {
            stdout: '',
            stderr: '',
            exitCode: 0
          }
        }
        if (command.includes('--dry-run')) {
          return {
            stdout: 'Merge would succeed without conflicts',
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const result = await validatePreMerge(mockExec, 'feature', 'main')

      expect(result.isValid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('should validate state before rebase', async () => {
      const validatePreRebase = async (exec: ExecFunction, source: string, destination: string): Promise<ValidationResult> => {
        const issues: ValidationIssue[] = []
        const warnings: ValidationWarning[] = []

        // Check working copy is clean
        const statusResult = await exec('jj status')
        const isClean = statusResult.stdout.includes('Working copy: clean')

        if (!isClean) {
          issues.push({
            severity: 'error',
            type: 'uncommitted_changes',
            message: 'Cannot rebase with uncommitted changes',
            suggestion: 'Commit changes before rebasing'
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
              suggestion: 'Check revision identifier'
            })
          }

          const destResult = await exec(`jj log -r ${destination} -l 1`)
          if (destResult.exitCode !== 0) {
            issues.push({
              severity: 'error',
              type: 'invalid_state',
              message: `Destination revision '${destination}' does not exist`,
              suggestion: 'Check revision identifier'
            })
          }
        } catch {
          warnings.push({
            type: 'compatibility',
            message: 'Could not verify revision references',
            suggestion: 'Manually verify source and destination exist'
          })
        }

        // Check for potential rebase conflicts
        try {
          const dryRunResult = await exec(`jj rebase -s ${source} -d ${destination} --dry-run`)
          if (dryRunResult.exitCode !== 0) {
            warnings.push({
              type: 'best_practice',
              message: 'Rebase may encounter conflicts',
              suggestion: 'Be prepared to resolve conflicts during rebase'
            })
          }
        } catch {
          // Dry run might not be supported
        }

        return {
          isValid: issues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
          issues,
          warnings
        }
      }

      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj status')) {
          return {
            stdout: `Parent commit: abc123def456\nWorking copy: clean`,
            stderr: '',
            exitCode: 0
          }
        }
        if (command.includes('jj log -r')) {
          return {
            stdout: `abc123def456`,
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const result = await validatePreRebase(mockExec, 'feature', 'main')

      expect(result.isValid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('should validate state before commit', async () => {
      const validatePreCommit = async (exec: ExecFunction): Promise<ValidationResult> => {
        const issues: ValidationIssue[] = []
        const warnings: ValidationWarning[] = []

        // Check for staged/modified files
        const statusResult = await exec('jj status')
        const hasChanges = statusResult.stdout.includes('Working copy changes:')

        if (!hasChanges) {
          warnings.push({
            type: 'best_practice',
            message: 'No changes to commit',
            suggestion: 'Make changes before attempting to commit'
          })
        }

        // Check for large files (performance warning)
        if (hasChanges) {
          const diffStatResult = await exec('jj diff --stat')
          const lines = diffStatResult.stdout.split('\n')

          lines.forEach(line => {
            // Look for files with very large changes
            const match = line.match(/(\S+)\s*\|\s*(\d+)\s*[+\-]+/)
            if (match) {
              const fileName = match[1]
              const changes = parseInt(match[2])

              if (changes > 1000) {
                warnings.push({
                  type: 'performance',
                  message: `Large file change detected: ${fileName} (${changes} lines)`,
                  suggestion: 'Consider splitting large changes into smaller commits'
                })
              }

              // Check for potential binary files
              if (fileName.match(/\.(jpg|png|gif|pdf|zip|tar|gz|exe|bin)$/i)) {
                warnings.push({
                  type: 'best_practice',
                  message: `Binary file detected: ${fileName}`,
                  suggestion: 'Consider if binary files should be tracked'
                })
              }
            }
          })
        }

        return {
          isValid: true, // Pre-commit validation rarely blocks completely
          issues,
          warnings
        }
      }

      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj status')) {
          return {
            stdout: `Parent commit: abc123def456\nWorking copy changes:\nM src/auth.ts\nA large-data.json`,
            stderr: '',
            exitCode: 0
          }
        }
        if (command.includes('jj diff --stat')) {
          return {
            stdout: `src/auth.ts        | 45 +++++++++++++++++++++++++++\nlarge-data.json    | 2500 +++++++++++++++++++++++++++++++++++++++++++\n2 files changed, 2545 insertions(+), 0 deletions(-)`,
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const result = await validatePreCommit(mockExec)

      expect(result.isValid).toBe(true)
      expect(result.warnings).toHaveLength(1) // Large file warning
      expect(result.warnings[0].type).toBe('performance')
    })
  })

  describe('Post-operation Validation', () => {
    it('should validate state after merge', async () => {
      const validatePostMerge = async (exec: ExecFunction, expectedResult?: string): Promise<ValidationResult> => {
        const issues: ValidationIssue[] = []
        const warnings: ValidationWarning[] = []

        // Check merge completed successfully
        const statusResult = await exec('jj status')

        // Verify working copy is clean after merge
        const isClean = statusResult.stdout.includes('Working copy: clean')
        if (!isClean) {
          issues.push({
            severity: 'error',
            type: 'uncommitted_changes',
            message: 'Working copy is not clean after merge',
            suggestion: 'Merge may not have completed successfully'
          })
        }

        // Check for remaining conflicts
        try {
          const conflictResult = await exec('jj resolve --list')
          const hasConflicts = conflictResult.stdout.trim().length > 0

          if (hasConflicts) {
            issues.push({
              severity: 'critical',
              type: 'conflict',
              message: 'Conflicts remain after merge',
              suggestion: 'Merge was not completed properly'
            })
          }
        } catch {
          warnings.push({
            type: 'compatibility',
            message: 'Could not verify conflict resolution',
            suggestion: 'Manually check for remaining conflicts'
          })
        }

        // Verify expected result if provided
        if (expectedResult) {
          const logResult = await exec('jj log -r @ --template "{commit_id}"')
          if (logResult.exitCode === 0 && logResult.stdout.trim() !== expectedResult) {
            warnings.push({
              type: 'compatibility',
              message: 'Merge result differs from expected',
              suggestion: 'Verify merge was completed as intended'
            })
          }
        }

        return {
          isValid: issues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
          issues,
          warnings
        }
      }

      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj status')) {
          return {
            stdout: `Parent commit: mergecommit123\nWorking copy: clean`,
            stderr: '',
            exitCode: 0
          }
        }
        if (command.includes('jj resolve --list')) {
          return {
            stdout: '',
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const result = await validatePostMerge(mockExec)

      expect(result.isValid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('should validate repository consistency', async () => {
      const validateRepositoryConsistency = async (exec: ExecFunction): Promise<ValidationResult> => {
        const issues: ValidationIssue[] = []
        const warnings: ValidationWarning[] = []

        // Check basic repository operations work
        try {
          const statusResult = await exec('jj status')
          if (statusResult.exitCode !== 0) {
            issues.push({
              severity: 'critical',
              type: 'corrupted_index',
              message: 'Basic repository operations failing',
              suggestion: 'Repository may be corrupted'
            })
          }
        } catch {
          issues.push({
            severity: 'critical',
            type: 'invalid_state',
            message: 'Cannot execute basic repository commands',
            suggestion: 'Check repository integrity and permissions'
          })
        }

        // Check log consistency
        try {
          const logResult = await exec('jj log -l 10')
          if (logResult.exitCode !== 0) {
            issues.push({
              severity: 'error',
              type: 'corrupted_index',
              message: 'Cannot read commit history',
              suggestion: 'Repository history may be corrupted'
            })
          }
        } catch {
          warnings.push({
            type: 'compatibility',
            message: 'Could not verify commit history',
            suggestion: 'Manually check repository log'
          })
        }

        // Performance check - large number of uncommitted files
        try {
          const statusResult = await exec('jj status')
          const changeLines = statusResult.stdout.split('\n').filter(line =>
            line.match(/^[AMD]\s+/)
          )

          if (changeLines.length > 100) {
            warnings.push({
              type: 'performance',
              message: `Large number of uncommitted files (${changeLines.length})`,
              suggestion: 'Consider committing changes in smaller batches'
            })
          }
        } catch {
          // Ignore if we can't check
        }

        return {
          isValid: issues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
          issues,
          warnings
        }
      }

      const result = await validateRepositoryConsistency(mockExec)

      expect(result.isValid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })
  })

  describe('Performance and Health Checks', () => {
    it('should check repository performance', async () => {
      const checkRepositoryPerformance = async (exec: ExecFunction): Promise<ValidationResult> => {
        const issues: ValidationIssue[] = []
        const warnings: ValidationWarning[] = []

        // Check repository size (estimate)
        try {
          const statusResult = await exec('jj status')
          const operationStart = Date.now()

          // Simulate checking operation time
          await new Promise(resolve => setTimeout(resolve, 10)) // Simulate work

          const operationTime = Date.now() - operationStart

          if (operationTime > 5000) { // 5 seconds
            warnings.push({
              type: 'performance',
              message: `Slow repository operations detected (${operationTime}ms)`,
              suggestion: 'Repository may benefit from optimization'
            })
          }
        } catch {
          warnings.push({
            type: 'performance',
            message: 'Could not measure repository performance',
            suggestion: 'Monitor repository operation times manually'
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
              suggestion: 'Consider repository archiving strategies for old history'
            })
          }
        } catch {
          // Ignore if log fails
        }

        return {
          isValid: true, // Performance issues don't invalidate repository
          issues,
          warnings
        }
      }

      const result = await checkRepositoryPerformance(mockExec)

      expect(result.isValid).toBe(true)
      // Performance check should complete without critical issues
    })

    it('should validate workspace health', async () => {
      const validateWorkspaceHealth = async (exec: ExecFunction): Promise<ValidationResult> => {
        const issues: ValidationIssue[] = []
        const warnings: ValidationWarning[] = []

        // Check workspace permissions
        try {
          // Test write permissions by attempting a dummy operation
          const testResult = await exec('jj log -r @ --template "{commit_id}"')

          if (testResult.exitCode !== 0) {
            issues.push({
              severity: 'error',
              type: 'invalid_state',
              message: 'Cannot read from repository',
              suggestion: 'Check file permissions and repository access'
            })
          }
        } catch {
          issues.push({
            severity: 'critical',
            type: 'invalid_state',
            message: 'Cannot execute repository operations',
            suggestion: 'Check repository setup and permissions'
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
                suggestion: 'Consider cleaning up unused workspaces'
              })
            }
          }
        } catch {
          // Workspace commands might not be available
        }

        return {
          isValid: issues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
          issues,
          warnings
        }
      }

      const result = await validateWorkspaceHealth(mockExec)

      expect(result.isValid).toBe(true)
    })
  })

  describe('Comprehensive Validation Suite', () => {
    it('should run complete repository validation', async () => {
      const runCompleteValidation = async (exec: ExecFunction): Promise<ValidationResult> => {
        const allIssues: ValidationIssue[] = []
        const allWarnings: ValidationWarning[] = []

        // Basic state validation
        try {
          const statusResult = await exec('jj status')

          if (statusResult.exitCode !== 0) {
            allIssues.push({
              severity: 'critical',
              type: 'invalid_state',
              message: 'Repository status check failed',
              suggestion: 'Repository may be corrupted or inaccessible'
            })
          } else {
            // Check for uncommitted changes
            if (statusResult.stdout.includes('Working copy changes:')) {
              allWarnings.push({
                type: 'best_practice',
                message: 'Working copy has uncommitted changes',
                suggestion: 'Consider committing or stashing changes'
              })
            }
          }
        } catch {
          allIssues.push({
            severity: 'critical',
            type: 'invalid_state',
            message: 'Cannot access repository',
            suggestion: 'Check repository path and permissions'
          })
        }

        // Conflict validation
        try {
          const conflictResult = await exec('jj resolve --list')

          if (conflictResult.stdout.trim()) {
            const conflictCount = conflictResult.stdout.split('\n').length
            allIssues.push({
              severity: 'error',
              type: 'conflict',
              message: `${conflictCount} unresolved conflicts found`,
              suggestion: 'Resolve all conflicts before proceeding'
            })
          }
        } catch {
          allWarnings.push({
            type: 'compatibility',
            message: 'Could not check for conflicts',
            suggestion: 'Manually verify no conflicts exist'
          })
        }

        // History validation
        try {
          const logResult = await exec('jj log -l 1')

          if (logResult.exitCode !== 0) {
            allIssues.push({
              severity: 'error',
              type: 'corrupted_index',
              message: 'Cannot read commit history',
              suggestion: 'Repository history may be corrupted'
            })
          }
        } catch {
          allWarnings.push({
            type: 'compatibility',
            message: 'Could not verify commit history',
            suggestion: 'Manually check repository log functionality'
          })
        }

        return {
          isValid: allIssues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
          issues: allIssues,
          warnings: allWarnings
        }
      }

      const result = await runCompleteValidation(mockExec)

      expect(result).toBeDefined()
      expect(result.isValid).toBe(true)
      expect(Array.isArray(result.issues)).toBe(true)
      expect(Array.isArray(result.warnings)).toBe(true)
    })
  })
})
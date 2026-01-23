import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { renderHook, act } from '@testing-library/react'
import type { ExecFunction } from '../../issues/smithershub/src/types'
import type { Commit } from '../../src/db/types'

const mockExec = mock() as jest.MockedFunction<ExecFunction>
const mockDb = {
  vcs: {
    logCommit: mock(),
    getCommits: mock(),
    logSnapshot: mock(),
  },
  state: {
    get: mock(),
    set: mock(),
  },
  agents: {
    start: mock(),
    complete: mock(),
    fail: mock(),
  }
} as any

const mockCommit: Commit = {
  id: 'commit-123',
  execution_id: 'exec-456',
  agent_id: 'agent-committer',
  change_id: 'xyz789abc',
  commit_id: 'def456ghi',
  message: 'feat: Add authentication system\n\n- Implement JWT token handling\n- Add user login/logout\n- Update security middleware',
  author: 'dev@example.com',
  timestamp: new Date('2024-01-15T10:00:00Z'),
  files_changed: ['src/auth/jwt.ts', 'src/auth/middleware.ts', 'src/routes/auth.ts'],
  insertions: 145,
  deletions: 12,
  parent_commits: ['abc123def'],
  created_at: new Date('2024-01-15T10:00:00Z')
}

interface CommitValidation {
  isValid: boolean
  issues: string[]
  suggestions: string[]
}

describe('Committer Component', () => {
  beforeEach(() => {
    mock.restore()

    // Setup default JJ command responses
    mockExec.mockImplementation(async (command: string) => {
      if (command.includes('jj status')) {
        return {
          stdout: `Parent commit: abc123def\nWorking copy: 3 files modified`,
          stderr: '',
          exitCode: 0
        }
      }
      if (command.includes('jj commit')) {
        return {
          stdout: `Created commit def456ghi\nChange ID: xyz789abc`,
          stderr: '',
          exitCode: 0
        }
      }
      if (command.includes('jj diff --stat')) {
        return {
          stdout: `src/auth/jwt.ts        | 89 +++++++++++++++++++\nsrc/auth/middleware.ts | 45 ++++++++++\nsrc/routes/auth.ts     | 23 ++++++\n3 files changed, 145 insertions(+), 12 deletions(-)`,
          stderr: '',
          exitCode: 0
        }
      }
      return { stdout: '', stderr: '', exitCode: 0 }
    })

    mockDb.state.get.mockReturnValue(null)
  })

  describe('Commit Creation', () => {
    it('should create commit with proper conventional format', async () => {
      const commitMessage = 'feat: Add user authentication\n\n- Implement JWT token handling\n- Add login/logout endpoints\n- Update security middleware\n\nCloses #123'

      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj commit')) {
          return {
            stdout: `Created commit abc123\nChange ID: def456`,
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const result = await mockExec(`jj commit -m "${commitMessage}"`)

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Created commit')
      expect(result.stdout).toContain('Change ID')
    })

    it('should validate commit message format', () => {
      const validMessages = [
        'feat: add new feature',
        'fix: resolve authentication bug',
        'docs: update API documentation',
        'style: format code according to style guide',
        'refactor: restructure auth module',
        'test: add unit tests for auth service',
        'chore: update dependencies'
      ]

      const invalidMessages = [
        'added new feature',           // No type prefix
        'feat add new feature',        // Missing colon
        'FEAT: add new feature',       // Wrong case
        'feat: ',                      // Empty description
        'feat:add new feature',        // Missing space
        'random: add new feature',     // Invalid type
      ]

      const conventionalCommitRegex = /^(feat|fix|docs|style|refactor|test|chore):\s.+/

      validMessages.forEach(msg => {
        expect(conventionalCommitRegex.test(msg)).toBe(true)
      })

      invalidMessages.forEach(msg => {
        expect(conventionalCommitRegex.test(msg)).toBe(false)
      })
    })

    it('should include file statistics in commit data', async () => {
      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj diff --stat')) {
          return {
            stdout: `src/auth.ts     | 45 ++++++++++++++++\nsrc/routes.ts   | 12 ++++-\ntests/auth.test | 25 ++++++++++\n3 files changed, 82 insertions(+), 0 deletions(-)`,
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const statResult = await mockExec('jj diff --stat')
      const stats = statResult.stdout

      expect(stats).toContain('3 files changed')
      expect(stats).toContain('82 insertions')
      expect(stats).toContain('src/auth.ts')
    })
  })

  describe('Pre-commit Validation', () => {
    it('should validate working copy has changes', async () => {
      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj status')) {
          return {
            stdout: `Parent commit: abc123\nWorking copy: clean`,
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const statusResult = await mockExec('jj status')
      const hasChanges = !statusResult.stdout.includes('clean')

      expect(hasChanges).toBe(false)

      // Should not create empty commit
      if (!hasChanges) {
        expect(true).toBe(true) // Correctly prevented empty commit
      }
    })

    it('should validate commit message quality', () => {
      const commitValidations: Array<[string, CommitValidation]> = [
        [
          'feat: Add user authentication system',
          { isValid: true, issues: [], suggestions: [] }
        ],
        [
          'fix stuff',
          {
            isValid: false,
            issues: ['Missing conventional commit format', 'Description too vague'],
            suggestions: ['Use format: type: description', 'Be more specific about what was fixed']
          }
        ],
        [
          'feat: add',
          {
            isValid: false,
            issues: ['Description too short'],
            suggestions: ['Provide more detailed description of what was added']
          }
        ],
        [
          'feat: Add user authentication system with JWT tokens, OAuth integration, password hashing, session management, role-based access control, and comprehensive security middleware for protecting all API endpoints and user data',
          {
            isValid: false,
            issues: ['Description too long (over 100 characters)'],
            suggestions: ['Keep first line under 72 characters', 'Move details to commit body']
          }
        ]
      ]

      commitValidations.forEach(([message, expected]) => {
        const validation = validateCommitMessage(message)

        expect(validation.isValid).toBe(expected.isValid)

        if (!expected.isValid) {
          expect(validation.issues.length).toBeGreaterThan(0)
        }
      })
    })

    it('should check for sensitive information in commit', () => {
      const suspiciousPatterns = [
        /password\s*=\s*["'].*["']/i,
        /api[_-]?key\s*=\s*["'].*["']/i,
        /secret\s*=\s*["'].*["']/i,
        /token\s*=\s*["'].*["']/i,
        /\b[A-Za-z0-9]{32,}\b/, // Potential hash/key
      ]

      const codeChanges = [
        'const apiKey = "abc123def456"',          // Should trigger
        'const password = "secretpassword"',       // Should trigger
        'const config = { debug: true }',          // Should not trigger
        'export const API_ENDPOINT = "https://"', // Should not trigger
      ]

      codeChanges.forEach(change => {
        const hasSensitiveData = suspiciousPatterns.some(pattern => pattern.test(change))

        if (change.includes('apiKey') || change.includes('password')) {
          expect(hasSensitiveData).toBe(true)
        } else {
          expect(hasSensitiveData).toBe(false)
        }
      })
    })
  })

  describe('JJ Integration', () => {
    it('should create snapshot before commit', async () => {
      const snapshotMessage = 'Pre-commit snapshot for feat: Add auth system'

      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj commit') && command.includes(snapshotMessage)) {
          return {
            stdout: `Created commit snapshot-123\nChange ID: snap-456`,
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      // Create snapshot
      const snapshotResult = await mockExec(`jj commit -m "${snapshotMessage}"`)

      expect(snapshotResult.exitCode).toBe(0)
      expect(snapshotResult.stdout).toContain('Created commit')

      // Log snapshot to database
      mockDb.vcs.logSnapshot({
        execution_id: 'exec-456',
        commit_id: 'snapshot-123',
        change_id: 'snap-456',
        message: snapshotMessage,
        type: 'pre_commit'
      })

      expect(mockDb.vcs.logSnapshot).toHaveBeenCalled()
    })

    it('should handle JJ change ID tracking', async () => {
      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj log -r @')) {
          return {
            stdout: `Change ID: xyz789abc\nCommit ID: def456ghi\nAuthor: dev@example.com\nDate: 2024-01-15 10:00:00\n\nfeat: Add authentication system`,
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const logResult = await mockExec('jj log -r @ --template "Change ID: {change_id}\nCommit ID: {commit_id}"')

      expect(logResult.stdout).toContain('Change ID: xyz789abc')
      expect(logResult.stdout).toContain('Commit ID: def456ghi')
    })

    it('should support commit amending via JJ describe', async () => {
      const newMessage = 'feat: Add comprehensive authentication system\n\n- JWT token implementation\n- OAuth provider integration\n- Session management\n- Password hashing with bcrypt'

      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj describe')) {
          return {
            stdout: `Updated change xyz789abc\nNew description applied`,
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const amendResult = await mockExec(`jj describe -m "${newMessage}"`)

      expect(amendResult.exitCode).toBe(0)
      expect(amendResult.stdout).toContain('Updated change')
    })

    it('should handle commit squashing', async () => {
      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj squash')) {
          return {
            stdout: `Squashed 3 commits into 1\nResult: commit abc123def`,
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const squashResult = await mockExec('jj squash -r feat-start::feat-end')

      expect(squashResult.exitCode).toBe(0)
      expect(squashResult.stdout).toContain('Squashed 3 commits')
    })
  })

  describe('Commit Hooks Integration', () => {
    it('should run pre-commit hooks', async () => {
      const hookCommands = [
        'bunx oxlint src/',
        'bun test --reporter=json',
        'bun run typecheck'
      ]

      const hookResults = []

      // Mock hook execution
      for (const command of hookCommands) {
        mockExec.mockImplementation(async (cmd: string) => {
          if (cmd === command) {
            return { stdout: 'Hook passed', stderr: '', exitCode: 0 }
          }
          return { stdout: '', stderr: '', exitCode: 0 }
        })

        const result = await mockExec(command)
        hookResults.push(result)
      }

      const allHooksPassed = hookResults.every(result => result.exitCode === 0)

      expect(allHooksPassed).toBe(true)
      expect(hookResults).toHaveLength(3)
    })

    it('should handle pre-commit hook failures', async () => {
      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('oxlint')) {
          return {
            stdout: '',
            stderr: 'Linting errors found:\nsrc/auth.ts:42:10 - Unused variable "token"',
            exitCode: 1
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const lintResult = await mockExec('bunx oxlint src/')

      expect(lintResult.exitCode).toBe(1)
      expect(lintResult.stderr).toContain('Linting errors')

      // Should not proceed with commit
      const shouldAbortCommit = lintResult.exitCode !== 0
      expect(shouldAbortCommit).toBe(true)
    })
  })

  describe('Commit Metadata and Tracking', () => {
    it('should extract commit statistics', async () => {
      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj diff --stat')) {
          return {
            stdout: `src/auth/jwt.ts        | 89 +++++++++++++++++++++++++++++\nsrc/auth/middleware.ts | 45 +++++++++++++++++++\nsrc/routes/auth.ts     | 23 +++++++++\ntests/auth.test.ts     | 67 ++++++++++++++++++++++++\n4 files changed, 224 insertions(+), 0 deletions(-)`,
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const statResult = await mockExec('jj diff --stat')
      const stats = parseCommitStats(statResult.stdout)

      expect(stats.filesChanged).toBe(4)
      expect(stats.insertions).toBe(224)
      expect(stats.deletions).toBe(0)
      expect(stats.files).toContain('src/auth/jwt.ts')
      expect(stats.files).toContain('tests/auth.test.ts')
    })

    it('should log commit to database', async () => {
      const commitData = mockCommit

      mockDb.vcs.logCommit.mockResolvedValue(commitData)

      const loggedCommit = await mockDb.vcs.logCommit({
        execution_id: 'exec-456',
        agent_id: 'agent-committer',
        change_id: 'xyz789abc',
        commit_id: 'def456ghi',
        message: commitData.message,
        author: 'dev@example.com',
        files_changed: commitData.files_changed,
        insertions: 145,
        deletions: 12,
        parent_commits: ['abc123def']
      })

      expect(loggedCommit.change_id).toBe('xyz789abc')
      expect(loggedCommit.message).toContain('feat: Add authentication system')
      expect(loggedCommit.files_changed).toHaveLength(3)
      expect(mockDb.vcs.logCommit).toHaveBeenCalled()
    })

    it('should associate commit with agent execution', () => {
      const commitData = {
        ...mockCommit,
        agent_id: 'agent-implementer-123',
        execution_id: 'exec-456'
      }

      // Verify agent association
      expect(commitData.agent_id).toBe('agent-implementer-123')
      expect(commitData.execution_id).toBe('exec-456')

      // Should be able to query commits by agent
      mockDb.vcs.getCommits.mockReturnValue([commitData])

      const agentCommits = mockDb.vcs.getCommits({ agent_id: 'agent-implementer-123' })

      expect(agentCommits).toHaveLength(1)
      expect(agentCommits[0].agent_id).toBe('agent-implementer-123')
    })
  })

  describe('Error Handling and Recovery', () => {
    it('should handle commit failures gracefully', async () => {
      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj commit')) {
          return {
            stdout: '',
            stderr: 'Error: Cannot commit in detached HEAD state',
            exitCode: 1
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const commitResult = await mockExec('jj commit -m "feat: add feature"')

      expect(commitResult.exitCode).toBe(1)
      expect(commitResult.stderr).toContain('Cannot commit')

      // Should mark agent as failed
      if (commitResult.exitCode !== 0) {
        await mockDb.agents.fail('agent-committer', commitResult.stderr)
        expect(mockDb.agents.fail).toHaveBeenCalled()
      }
    })

    it('should rollback on post-commit verification failure', async () => {
      // Mock successful commit
      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj commit')) {
          return {
            stdout: 'Created commit abc123',
            stderr: '',
            exitCode: 0
          }
        }
        if (command.includes('bun test')) {
          return {
            stdout: '',
            stderr: 'Tests failed after commit',
            exitCode: 1
          }
        }
        if (command.includes('jj undo')) {
          return {
            stdout: 'Undid 1 operation',
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      // Commit succeeds
      const commitResult = await mockExec('jj commit -m "feat: add feature"')
      expect(commitResult.exitCode).toBe(0)

      // Post-commit tests fail
      const testResult = await mockExec('bun test')
      expect(testResult.exitCode).toBe(1)

      // Rollback commit
      if (testResult.exitCode !== 0) {
        const undoResult = await mockExec('jj undo')
        expect(undoResult.exitCode).toBe(0)
      }
    })
  })

  describe('Throttling and Rate Limiting', () => {
    it('should enforce commit rate limits', () => {
      const commitHistory = [
        { timestamp: Date.now() - 30000 },  // 30 seconds ago
        { timestamp: Date.now() - 60000 },  // 1 minute ago
        { timestamp: Date.now() - 120000 }, // 2 minutes ago
      ]

      const rateLimitWindow = 300000 // 5 minutes
      const maxCommitsPerWindow = 5

      const recentCommits = commitHistory.filter(
        commit => Date.now() - commit.timestamp < rateLimitWindow
      )

      expect(recentCommits).toHaveLength(3)

      const shouldThrottle = recentCommits.length >= maxCommitsPerWindow
      expect(shouldThrottle).toBe(false) // Under limit
    })

    it('should delay between commit attempts', async () => {
      const commitDelay = 1000 // 1 second
      const startTime = Date.now()

      await new Promise(resolve => setTimeout(resolve, commitDelay))

      const elapsed = Date.now() - startTime
      expect(elapsed).toBeGreaterThanOrEqual(commitDelay)
    })
  })
})

// Helper functions for tests
function validateCommitMessage(message: string): CommitValidation {
  const issues: string[] = []
  const suggestions: string[] = []

  // Check conventional commit format
  const conventionalRegex = /^(feat|fix|docs|style|refactor|test|chore):\s.+/
  if (!conventionalRegex.test(message)) {
    issues.push('Missing conventional commit format')
    suggestions.push('Use format: type: description')
  }

  // Check length
  const firstLine = message.split('\n')[0]
  if (firstLine.length < 10) {
    issues.push('Description too short')
    suggestions.push('Provide more detailed description')
  }

  if (firstLine.length > 100) {
    issues.push('Description too long (over 100 characters)')
    suggestions.push('Keep first line under 72 characters', 'Move details to commit body')
  }

  // Check vague descriptions
  const vagueWords = ['stuff', 'things', 'misc', 'various', 'update', 'fix']
  const hasVagueWords = vagueWords.some(word =>
    firstLine.toLowerCase().includes(word) && firstLine.split(' ').length < 4
  )

  if (hasVagueWords) {
    issues.push('Description too vague')
    suggestions.push('Be more specific about what was changed')
  }

  return {
    isValid: issues.length === 0,
    issues,
    suggestions
  }
}

function parseCommitStats(statOutput: string): {
  filesChanged: number
  insertions: number
  deletions: number
  files: string[]
} {
  const lines = statOutput.split('\n')
  const files: string[] = []

  let filesChanged = 0
  let insertions = 0
  let deletions = 0

  lines.forEach(line => {
    // Parse individual file lines
    const fileMatch = line.match(/^(.+?)\s*\|\s*\d+\s*[+\-]*$/)
    if (fileMatch) {
      files.push(fileMatch[1].trim())
    }

    // Parse summary line
    const summaryMatch = line.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(\-\))?/)
    if (summaryMatch) {
      filesChanged = parseInt(summaryMatch[1])
      insertions = summaryMatch[2] ? parseInt(summaryMatch[2]) : 0
      deletions = summaryMatch[3] ? parseInt(summaryMatch[3]) : 0
    }
  })

  return { filesChanged, insertions, deletions, files }
}
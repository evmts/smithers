/**
 * Integration tests for Git/Commit.tsx - Git commit component with real git operations.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test'
import { createSmithersRoot } from '../../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../../db/index.js'
import { SmithersProvider } from '../SmithersProvider.js'
import { Commit, type CommitProps, type CommitResult } from './Commit.js'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'

const SMITHERS_NOTES_REF = 'refs/notes/smithers'

// Helper: Create a temp git repo
async function createTempGitRepo(): Promise<string> {
  const tempDir = join(tmpdir(), `smithers-commit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tempDir, { recursive: true })

  // Initialize git repo
  await Bun.$`git init`.cwd(tempDir).quiet()
  await Bun.$`git config user.email "test@test.com"`.cwd(tempDir).quiet()
  await Bun.$`git config user.name "Test User"`.cwd(tempDir).quiet()

  // Create initial commit
  writeFileSync(join(tempDir, 'README.md'), '# Test Repo\n')
  await Bun.$`git add -A`.cwd(tempDir).quiet()
  await Bun.$`git commit -m "Initial commit"`.cwd(tempDir).quiet()

  return tempDir
}

// Helper: Cleanup temp dir
function cleanupTempDir(dir: string) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Helper: Get git notes for commit
async function getNotesForCommit(cwd: string, ref: string = 'HEAD'): Promise<string | null> {
  try {
    const result = await Bun.$`git notes --ref ${SMITHERS_NOTES_REF} show ${ref}`.cwd(cwd).text()
    return result.trim()
  } catch {
    return null
  }
}

// Helper: Get last commit hash
async function getLastCommitHash(cwd: string): Promise<string> {
  return (await Bun.$`git rev-parse HEAD`.cwd(cwd).text()).trim()
}

// Helper: Get last commit message
async function getLastCommitMessage(cwd: string): Promise<string> {
  return (await Bun.$`git log -1 --format=%s`.cwd(cwd).text()).trim()
}

describe('CommitProps interface', () => {
  test('message is optional', () => {
    const props: CommitProps = {}
    expect(props.message).toBeUndefined()
  })

  test('message can be set', () => {
    const props: CommitProps = { message: 'Add new feature' }
    expect(props.message).toBe('Add new feature')
  })

  test('autoGenerate is optional boolean', () => {
    const props: CommitProps = { autoGenerate: true }
    expect(props.autoGenerate).toBe(true)
  })

  test('notes is optional object', () => {
    const props: CommitProps = { notes: { key: 'value', number: 42 } }
    expect(props.notes?.key).toBe('value')
  })

  test('files is optional string array', () => {
    const props: CommitProps = { files: ['file1.ts', 'file2.ts'] }
    expect(props.files).toHaveLength(2)
  })

  test('all is optional boolean for -a flag', () => {
    const props: CommitProps = { all: true }
    expect(props.all).toBe(true)
  })

  test('children can be used as message', () => {
    const props: CommitProps = { children: 'Commit message via children' }
    expect(props.children).toBe('Commit message via children')
  })

  test('onFinished callback type signature', () => {
    let receivedResult: CommitResult | null = null
    const props: CommitProps = {
      onFinished: (result) => { receivedResult = result },
    }

    const mockResult: CommitResult = {
      commitHash: 'abc123',
      message: 'Test commit',
      filesChanged: ['file.ts'],
      insertions: 10,
      deletions: 5,
    }

    props.onFinished?.(mockResult)
    expect(receivedResult).toEqual(mockResult)
  })

  test('onError callback type signature', () => {
    let receivedError: Error | null = null
    const props: CommitProps = {
      onError: (error) => { receivedError = error },
    }

    const error = new Error('Commit failed')
    props.onError?.(error)
    expect(receivedError?.message).toBe('Commit failed')
  })
})

describe('CommitResult interface', () => {
  test('has all required fields', () => {
    const result: CommitResult = {
      commitHash: 'abc123def456',
      message: 'Feature: add new capability',
      filesChanged: ['src/index.ts', 'src/utils.ts'],
      insertions: 100,
      deletions: 50,
    }

    expect(result.commitHash).toBe('abc123def456')
    expect(result.message).toBe('Feature: add new capability')
    expect(result.filesChanged).toHaveLength(2)
    expect(result.insertions).toBe(100)
    expect(result.deletions).toBe(50)
  })

  test('filesChanged can be empty', () => {
    const result: CommitResult = {
      commitHash: 'abc123',
      message: 'Empty commit',
      filesChanged: [],
      insertions: 0,
      deletions: 0,
    }

    expect(result.filesChanged).toHaveLength(0)
  })
})

describe('Commit component integration', () => {
  let db: SmithersDB
  let executionId: string
  let tempDir: string
  let originalCwd: string

  beforeAll(async () => {
    db = createSmithersDB({ reset: true })
    executionId = await db.execution.start('commit-test', 'test.tsx')
  })

  afterAll(() => {
    db.close()
  })

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await createTempGitRepo()
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    cleanupTempDir(tempDir)
  })

  test('stages files and creates commit with message', async () => {
    // Create a file to commit
    writeFileSync(join(tempDir, 'test.ts'), 'export const x = 1\n')

    let commitResult: CommitResult | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit
          message="Add test file"
          onFinished={(result) => { commitResult = result }}
        />
      </SmithersProvider>
    )

    // Wait for async operations
    await new Promise((r) => setTimeout(r, 500))

    expect(commitResult).not.toBeNull()
    expect(commitResult!.message).toBe('Add test file')
    expect(commitResult!.commitHash).toBeDefined()
    expect(commitResult!.commitHash.length).toBeGreaterThan(6)

    // Verify commit exists in git
    const lastMsg = await getLastCommitMessage(tempDir)
    expect(lastMsg).toBe('Add test file')

    root.dispose()
  })

  test('uses children as commit message when message prop not provided', async () => {
    writeFileSync(join(tempDir, 'child-msg.ts'), 'export const y = 2\n')

    let commitResult: CommitResult | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit onFinished={(result) => { commitResult = result }}>
          Commit via children
        </Commit>
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(commitResult).not.toBeNull()
    expect(commitResult!.message).toBe('Commit via children')

    root.dispose()
  })

  test('stages specific files when files prop provided', async () => {
    writeFileSync(join(tempDir, 'file1.ts'), 'export const a = 1\n')
    writeFileSync(join(tempDir, 'file2.ts'), 'export const b = 2\n')

    let commitResult: CommitResult | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit
          message="Add file1 only"
          files={['file1.ts']}
          onFinished={(result) => { commitResult = result }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(commitResult).not.toBeNull()
    // file1.ts should be committed, file2.ts should remain unstaged
    const status = await Bun.$`git status --porcelain`.cwd(tempDir).text()
    expect(status).toContain('file2.ts')
    expect(status).not.toContain('file1.ts')

    root.dispose()
  })

  test('adds git notes with smithers metadata', async () => {
    writeFileSync(join(tempDir, 'notes-test.ts'), 'export const n = 1\n')

    let commitResult: CommitResult | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit
          message="Test notes"
          notes={{ customKey: 'customValue', taskId: 'task-123' }}
          onFinished={(result) => { commitResult = result }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(commitResult).not.toBeNull()

    // Verify notes were added
    const notes = await getNotesForCommit(tempDir)
    expect(notes).not.toBeNull()
    const notesData = JSON.parse(notes!)
    expect(notesData.smithers).toBe(true)
    expect(notesData.customKey).toBe('customValue')
    expect(notesData.taskId).toBe('task-123')
    expect(notesData.executionId).toBe(executionId)
    expect(notesData.timestamp).toBeDefined()

    root.dispose()
  })

  test('logs commit to database', async () => {
    writeFileSync(join(tempDir, 'db-log.ts'), 'export const d = 1\n')

    let commitResult: CommitResult | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit
          message="DB log test"
          onFinished={(result) => { commitResult = result }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(commitResult).not.toBeNull()

    // Verify commit was logged to DB
    const dbCommit = db.db.queryOne<{ commit_hash: string; message: string }>(
      "SELECT commit_hash, message FROM commits WHERE commit_hash = ?",
      [commitResult!.commitHash]
    )
    expect(dbCommit).not.toBeNull()
    expect(dbCommit!.message).toBe('DB log test')

    root.dispose()
  })

  test('handles error when no message provided and autoGenerate is false', async () => {
    writeFileSync(join(tempDir, 'no-msg.ts'), 'export const e = 1\n')

    let errorReceived: Error | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit
          onError={(err) => { errorReceived = err }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(errorReceived).not.toBeNull()
    expect(errorReceived!.message).toContain('No commit message provided')

    root.dispose()
  })

  test('handles staging failure gracefully', async () => {
    // Try to stage a non-existent file
    let errorReceived: Error | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit
          message="Should fail"
          files={['nonexistent-file-12345.ts']}
          onError={(err) => { errorReceived = err }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(errorReceived).not.toBeNull()

    root.dispose()
  })

  test('handles commit failure when nothing to commit', async () => {
    // Don't create any new files - nothing to commit
    let errorReceived: Error | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit
          message="Nothing to commit"
          onError={(err) => { errorReceived = err }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    // Git commit with nothing staged should fail
    expect(errorReceived).not.toBeNull()

    root.dispose()
  })

  test('special characters in commit message', async () => {
    writeFileSync(join(tempDir, 'special.ts'), 'export const s = 1\n')

    let commitResult: CommitResult | null = null
    const specialMessage = 'Fix: handle "quotes" & <brackets> + (parens) [braces]'
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit
          message={specialMessage}
          onFinished={(result) => { commitResult = result }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(commitResult).not.toBeNull()
    expect(commitResult!.message).toBe(specialMessage)

    const lastMsg = await getLastCommitMessage(tempDir)
    expect(lastMsg).toBe(specialMessage)

    root.dispose()
  })

  test('multiline commit message', async () => {
    writeFileSync(join(tempDir, 'multiline.ts'), 'export const m = 1\n')

    const multilineMessage = 'First line\n\nSecond paragraph with details'
    let commitResult: CommitResult | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit
          message={multilineMessage}
          onFinished={(result) => { commitResult = result }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(commitResult).not.toBeNull()

    // Git log with %B gets full message body
    const fullMsg = await Bun.$`git log -1 --format=%B`.cwd(tempDir).text()
    expect(fullMsg.trim()).toBe(multilineMessage)

    root.dispose()
  })

  test('renders correct status transitions', async () => {
    writeFileSync(join(tempDir, 'status.ts'), 'export const st = 1\n')

    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Status test" />
      </SmithersProvider>
    )

    // Check initial tree has git-commit element
    const tree = root.getTree()
    const findGitCommit = (node: any): any => {
      if (node.type === 'git-commit') return node
      for (const child of node.children || []) {
        const found = findGitCommit(child)
        if (found) return found
      }
      return null
    }

    const gitCommit = findGitCommit(tree)
    expect(gitCommit).not.toBeNull()
    expect(gitCommit.type).toBe('git-commit')

    await new Promise((r) => setTimeout(r, 500))

    root.dispose()
  })

  test('uses -a flag when all prop is true', async () => {
    writeFileSync(join(tempDir, 'tracked.ts'), 'export const t = 1\n')
    await Bun.$`git add tracked.ts`.cwd(tempDir).quiet()
    await Bun.$`git commit -m "Add tracked file"`.cwd(tempDir).quiet()

    // Modify the tracked file
    writeFileSync(join(tempDir, 'tracked.ts'), 'export const t = 2\n')

    let commitResult: CommitResult | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit
          message="Update with -a flag"
          all={true}
          onFinished={(result) => { commitResult = result }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(commitResult).not.toBeNull()
    expect(commitResult!.message).toBe('Update with -a flag')

    // File should be committed
    const status = await Bun.$`git status --porcelain`.cwd(tempDir).text()
    expect(status).not.toContain('tracked.ts')

    root.dispose()
  })

  test('tracks diff stats correctly', async () => {
    writeFileSync(join(tempDir, 'stats.ts'), 'line1\nline2\nline3\nline4\nline5\n')

    let commitResult: CommitResult | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit
          message="Stats test"
          onFinished={(result) => { commitResult = result }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(commitResult).not.toBeNull()
    expect(commitResult!.filesChanged).toContain('stats.ts')
    expect(commitResult!.insertions).toBeGreaterThan(0)
    expect(typeof commitResult!.deletions).toBe('number')

    root.dispose()
  })

  test('registers and completes task in database', async () => {
    writeFileSync(join(tempDir, 'task.ts'), 'export const tk = 1\n')

    const initialTaskCount = db.db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM tasks WHERE component_type = 'git-commit'"
    )?.count ?? 0

    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Task tracking test" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    const finalTaskCount = db.db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM tasks WHERE component_type = 'git-commit'"
    )?.count ?? 0

    expect(finalTaskCount).toBeGreaterThan(initialTaskCount)

    // Check latest git-commit task is completed
    const latestTask = db.db.queryOne<{ status: string }>(
      "SELECT status FROM tasks WHERE component_type = 'git-commit' ORDER BY started_at DESC LIMIT 1"
    )
    expect(latestTask?.status).toBe('completed')

    root.dispose()
  })
})

describe('Commit export verification', () => {
  test('exports Commit component', async () => {
    const { Commit } = await import('./Commit.js')
    expect(Commit).toBeDefined()
    expect(typeof Commit).toBe('function')
  })

  test('exports CommitProps type', async () => {
    const module = await import('./Commit.js')
    expect(module).toBeDefined()
  })

  test('exports CommitResult type', async () => {
    const module = await import('./Commit.js')
    expect(module).toBeDefined()
  })
})

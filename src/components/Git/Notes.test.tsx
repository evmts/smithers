/**
 * Integration tests for Git/Notes.tsx - Git notes component with real git operations.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test'
import { createSmithersRoot } from '../../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../../db/index.js'
import { SmithersProvider } from '../SmithersProvider.js'
import { Notes, type NotesProps, type NotesResult } from './Notes.js'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'

const SMITHERS_NOTES_REF = 'refs/notes/smithers'

// Helper: Create a temp git repo
async function createTempGitRepo(): Promise<string> {
  const tempDir = join(tmpdir(), `smithers-notes-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
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

// Helper: Get commit hash
async function getCommitHash(cwd: string, ref: string = 'HEAD'): Promise<string> {
  return (await Bun.$`git rev-parse ${ref}`.cwd(cwd).text()).trim()
}

// Helper: Create additional commits
async function createCommit(cwd: string, filename: string, message: string): Promise<string> {
  writeFileSync(join(cwd, filename), `content for ${filename}\n`)
  await Bun.$`git add -A`.cwd(cwd).quiet()
  await Bun.$`git commit -m ${message}`.cwd(cwd).quiet()
  return getCommitHash(cwd)
}

describe('NotesProps interface', () => {
  test('commitRef is optional, defaults to HEAD', () => {
    const props: NotesProps = { data: { key: 'value' } }
    expect(props.commitRef).toBeUndefined()
  })

  test('commitRef can be set', () => {
    const props: NotesProps = { commitRef: 'abc123', data: {} }
    expect(props.commitRef).toBe('abc123')
  })

  test('data is required object', () => {
    const props: NotesProps = { data: { smithers: true, version: '1.0' } }
    expect(props.data.smithers).toBe(true)
    expect(props.data.version).toBe('1.0')
  })

  test('append is optional boolean', () => {
    const props: NotesProps = { data: {}, append: true }
    expect(props.append).toBe(true)
  })

  test('append defaults to false (replace)', () => {
    const props: NotesProps = { data: {} }
    expect(props.append).toBeUndefined()
  })

  test('onFinished callback type signature', () => {
    let receivedResult: NotesResult | null = null
    const props: NotesProps = {
      data: {},
      onFinished: (result) => { receivedResult = result },
    }

    const mockResult: NotesResult = {
      commitRef: 'HEAD',
      data: { smithers: true },
      previousNotes: null,
    }

    props.onFinished?.(mockResult)
    expect(receivedResult).toEqual(mockResult)
  })

  test('onError callback type signature', () => {
    let receivedError: Error | null = null
    const props: NotesProps = {
      data: {},
      onError: (error) => { receivedError = error },
    }

    const error = new Error('Notes failed')
    props.onError?.(error)
    expect(receivedError?.message).toBe('Notes failed')
  })
})

describe('NotesResult interface', () => {
  test('has all required fields', () => {
    const result: NotesResult = {
      commitRef: 'abc123',
      data: { smithers: true, executionId: 'exec-1' },
      previousNotes: null,
    }

    expect(result.commitRef).toBe('abc123')
    expect(result.data.smithers).toBe(true)
    expect(result.previousNotes).toBeNull()
  })

  test('previousNotes can contain prior notes when appending', () => {
    const result: NotesResult = {
      commitRef: 'HEAD',
      data: { newData: true },
      previousNotes: '{"oldData": true}',
    }

    expect(result.previousNotes).toBe('{"oldData": true}')
  })
})

describe('Notes component integration', () => {
  let db: SmithersDB
  let executionId: string
  let tempDir: string
  let originalCwd: string

  beforeAll(async () => {
    db = createSmithersDB({ reset: true })
    executionId = await db.execution.start('notes-test', 'test.tsx')
  })

  afterAll(async () => {
    // Allow pending React effects to complete before closing db
    await new Promise((r) => setTimeout(r, 50))
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

  test('adds notes to HEAD by default', async () => {
    let notesResult: NotesResult | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Notes
          data={{ testKey: 'testValue' }}
          onFinished={(result) => { notesResult = result }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(notesResult).not.toBeNull()
    expect(notesResult!.commitRef).toBe('HEAD')

    // Verify notes in git
    const notes = await getNotesForCommit(tempDir)
    expect(notes).not.toBeNull()
    const notesData = JSON.parse(notes!)
    expect(notesData.testKey).toBe('testValue')
    expect(notesData.smithers).toBe(true)
    expect(notesData.executionId).toBe(executionId)

    root.dispose()
  })

  test('adds notes to specific commit ref', async () => {
    // Create a second commit
    const secondHash = await createCommit(tempDir, 'second.ts', 'Second commit')

    let notesResult: NotesResult | null = null
    const root = createSmithersRoot()

    // Get the first commit hash
    const firstHash = await getCommitHash(tempDir, 'HEAD~1')

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Notes
          commitRef={firstHash}
          data={{ target: 'first-commit' }}
          onFinished={(result) => { notesResult = result }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(notesResult).not.toBeNull()
    expect(notesResult!.commitRef).toBe(firstHash)

    // Verify notes on first commit
    const notes = await getNotesForCommit(tempDir, firstHash)
    expect(notes).not.toBeNull()
    const notesData = JSON.parse(notes!)
    expect(notesData.target).toBe('first-commit')

    // Second commit should not have notes
    const secondNotes = await getNotesForCommit(tempDir, secondHash)
    expect(secondNotes).toBeNull()

    root.dispose()
  })

  test('replaces notes when append is false', async () => {
    // First add notes
    await Bun.$`git notes --ref ${SMITHERS_NOTES_REF} add -m '{"original": true}'`.cwd(tempDir).quiet()

    let notesResult: NotesResult | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Notes
          data={{ replacement: true }}
          append={false}
          onFinished={(result) => { notesResult = result }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(notesResult).not.toBeNull()
    expect(notesResult!.previousNotes).toBeNull() // append=false doesn't fetch previous

    // Verify original notes were replaced
    const notes = await getNotesForCommit(tempDir)
    expect(notes).not.toBeNull()
    const notesData = JSON.parse(notes!)
    expect(notesData.replacement).toBe(true)
    expect(notesData.original).toBeUndefined()

    root.dispose()
  })

  test('appends notes when append is true', async () => {
    // First add notes
    const originalNotes = JSON.stringify({ original: true })
    await Bun.$`git notes --ref ${SMITHERS_NOTES_REF} add -m ${originalNotes}`.cwd(tempDir).quiet()

    let notesResult: NotesResult | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Notes
          data={{ appended: true }}
          append={true}
          onFinished={(result) => { notesResult = result }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(notesResult).not.toBeNull()
    expect(notesResult!.previousNotes).not.toBeNull()
    expect(notesResult!.previousNotes).toContain('original')

    // Verify notes contain both original and appended content
    const notes = await getNotesForCommit(tempDir)
    expect(notes).not.toBeNull()
    expect(notes).toContain('original')
    expect(notes).toContain('appended')

    root.dispose()
  })

  test('includes smithers metadata in notes', async () => {
    let notesResult: NotesResult | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Notes
          data={{ custom: 'value' }}
          onFinished={(result) => { notesResult = result }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(notesResult).not.toBeNull()
    expect(notesResult!.data.smithers).toBe(true)
    expect(notesResult!.data.executionId).toBe(executionId)
    expect(notesResult!.data.timestamp).toBeDefined()
    expect(typeof notesResult!.data.timestamp).toBe('number')
    expect(notesResult!.data.custom).toBe('value')

    root.dispose()
  })

  test('handles error for invalid commit ref', async () => {
    let errorReceived: Error | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Notes
          commitRef="nonexistent-ref-12345"
          data={{ test: true }}
          onError={(err) => { errorReceived = err }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(errorReceived).not.toBeNull()

    root.dispose()
  })

  test('renders correct git-notes element', async () => {
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Notes data={{ render: 'test' }} />
      </SmithersProvider>
    )

    const tree = root.getTree()
    const findGitNotes = (node: any): any => {
      if (node.type === 'git-notes') return node
      for (const child of node.children || []) {
        const found = findGitNotes(child)
        if (found) return found
      }
      return null
    }

    const gitNotes = findGitNotes(tree)
    expect(gitNotes).not.toBeNull()
    expect(gitNotes.type).toBe('git-notes')

    await new Promise((r) => setTimeout(r, 500))

    root.dispose()
  })

  test('complex data object in notes', async () => {
    const complexData = {
      nested: {
        deep: {
          value: 'nested-value',
        },
      },
      array: [1, 2, 3],
      boolean: true,
      number: 42,
      nullValue: null,
    }

    let notesResult: NotesResult | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Notes
          data={complexData}
          onFinished={(result) => { notesResult = result }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(notesResult).not.toBeNull()

    const notes = await getNotesForCommit(tempDir)
    expect(notes).not.toBeNull()
    const notesData = JSON.parse(notes!)
    expect(notesData.nested.deep.value).toBe('nested-value')
    expect(notesData.array).toEqual([1, 2, 3])
    expect(notesData.number).toBe(42)

    root.dispose()
  })

  test('registers and completes task in database', async () => {
    const initialTaskCount = db.db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM tasks WHERE component_type = 'git-notes'"
    )?.count ?? 0

    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Notes data={{ taskTracking: true }} />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    const finalTaskCount = db.db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM tasks WHERE component_type = 'git-notes'"
    )?.count ?? 0

    expect(finalTaskCount).toBeGreaterThan(initialTaskCount)

    // Check latest git-notes task is completed
    const latestTask = db.db.queryOne<{ status: string }>(
      "SELECT status FROM tasks WHERE component_type = 'git-notes' ORDER BY started_at DESC LIMIT 1"
    )
    expect(latestTask?.status).toBe('completed')

    root.dispose()
  })

  test('special characters in data values', async () => {
    const specialData = {
      quotes: 'value with "quotes"',
      unicode: 'emoji 🎉 and symbols ∑∏∐',
      newlines: 'line1\nline2\nline3',
      backslash: 'path\\to\\file',
    }

    let notesResult: NotesResult | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Notes
          data={specialData}
          onFinished={(result) => { notesResult = result }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(notesResult).not.toBeNull()

    const notes = await getNotesForCommit(tempDir)
    expect(notes).not.toBeNull()
    const notesData = JSON.parse(notes!)
    expect(notesData.quotes).toBe('value with "quotes"')
    expect(notesData.unicode).toContain('🎉')
    expect(notesData.newlines).toContain('\n')

    root.dispose()
  })

  test('multiple notes operations on different commits', async () => {
    // Create multiple commits
    const hash1 = await getCommitHash(tempDir) // Initial commit
    const hash2 = await createCommit(tempDir, 'file2.ts', 'Second')
    const hash3 = await createCommit(tempDir, 'file3.ts', 'Third')

    const results: NotesResult[] = []
    const root = createSmithersRoot()

    // Add notes to first commit
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Notes
          commitRef={hash1}
          data={{ commit: 1 }}
          onFinished={(r) => results.push(r)}
        />
      </SmithersProvider>
    )
    await new Promise((r) => setTimeout(r, 500))
    root.dispose()

    // Add notes to third commit
    const root2 = createSmithersRoot()
    await root2.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Notes
          commitRef={hash3}
          data={{ commit: 3 }}
          onFinished={(r) => results.push(r)}
        />
      </SmithersProvider>
    )
    await new Promise((r) => setTimeout(r, 500))
    root2.dispose()

    expect(results.length).toBe(2)

    // Verify notes on each commit
    const notes1 = await getNotesForCommit(tempDir, hash1)
    const notes2 = await getNotesForCommit(tempDir, hash2)
    const notes3 = await getNotesForCommit(tempDir, hash3)

    expect(notes1).not.toBeNull()
    expect(JSON.parse(notes1!).commit).toBe(1)

    expect(notes2).toBeNull() // No notes on second commit

    expect(notes3).not.toBeNull()
    expect(JSON.parse(notes3!).commit).toBe(3)
  })

  test('empty data object still adds smithers metadata', async () => {
    let notesResult: NotesResult | null = null
    const root = createSmithersRoot()

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Notes
          data={{}}
          onFinished={(result) => { notesResult = result }}
        />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 500))

    expect(notesResult).not.toBeNull()
    expect(notesResult!.data.smithers).toBe(true)
    expect(notesResult!.data.executionId).toBeDefined()
    expect(notesResult!.data.timestamp).toBeDefined()

    const notes = await getNotesForCommit(tempDir)
    expect(notes).not.toBeNull()
    const notesData = JSON.parse(notes!)
    expect(notesData.smithers).toBe(true)

    root.dispose()
  })
})

describe('Notes export verification', () => {
  test('exports Notes component', async () => {
    const { Notes } = await import('./Notes.js')
    expect(Notes).toBeDefined()
    expect(typeof Notes).toBe('function')
  })

  test('exports NotesProps type', async () => {
    const module = await import('./Notes.js')
    expect(module).toBeDefined()
  })

  test('exports NotesResult type', async () => {
    const module = await import('./Notes.js')
    expect(module).toBeDefined()
  })
})

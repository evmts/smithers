/**
 * Eval 10: VCS Git Components
 *
 * Tests Git VCS components with mocked mode (SMITHERS_MOCK_MODE prevents real git operations).
 * Validates XML rendering of Git.Commit and Git.Notes components.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestEnvironment, cleanupTestEnvironment, logEvalResult } from './setup'
import { SmithersProvider } from '../src/components/SmithersProvider'
import { Phase } from '../src/components/Phase'
import { Parallel } from '../src/components/Parallel'
import * as Git from '../src/components/Git'
import { validateXML } from './validation/output-validator'

describe('10-vcs-git', () => {
  let env: ReturnType<typeof createTestEnvironment>

  beforeEach(() => {
    env = createTestEnvironment('vcs-git')
  })

  afterEach(async () => {
    // Wait for async effects to complete
    await new Promise(resolve => setTimeout(resolve, 300))
    // Unmount root before cleaning up DB
    if (env.root) {
      env.root.dispose()
    }
    // Wait a bit more for disposal to complete
    await new Promise(resolve => setTimeout(resolve, 100))
    // Close database last
    if (env.db) {
      env.db.close()
    }
  })

  test('Git.Commit component renders', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Commit message="test commit">Initial commit</Git.Commit>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // XML validation
    expect(xml).toContain('<git-commit')
    expect(xml).toContain('status=')
    expect(xml).toContain('Initial commit')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-git-commit-renders',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
      },
      errors: [],
    })
  })

  test('Commit message from children', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Commit>
            feat: add new feature
          </Git.Commit>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<git-commit')
    expect(xml).toContain('feat: add new feature')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-commit-message-children',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Git.Notes component renders', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Notes
            data={{ reviewStatus: 'approved', reviewer: 'claude' }}
            commitRef="HEAD"
          />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<git-notes')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-git-notes-renders',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Notes with data prop', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Notes
            data={{
              task: 'implementation',
              status: 'complete',
              metadata: { lines: 100 }
            }}
          />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<git-notes')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-notes-with-data',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Multiple git operations render', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Commit message="first commit">
            Initial implementation
          </Git.Commit>
          <Git.Notes
            data={{ phase: 'setup' }}
            commitRef="HEAD"
          />
          <Git.Commit message="second commit">
            Add tests
          </Git.Commit>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Should have multiple git operations
    const commitMatches = xml.match(/<git-commit/g)
    const notesMatches = xml.match(/<git-notes/g)

    expect(commitMatches).toBeTruthy()
    expect(commitMatches!.length).toBeGreaterThanOrEqual(2)
    expect(notesMatches).toBeTruthy()
    expect(notesMatches!.length).toBeGreaterThanOrEqual(1)

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-multiple-git-operations',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        commit_count: commitMatches?.length || 0,
        notes_count: notesMatches?.length || 0,
      },
      errors: [],
    })
  })

  test('Git inside Phase renders', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="development">
          <Git.Commit message="implement feature">
            Add feature X
          </Git.Commit>
          <Git.Notes data={{ docType: 'readme' }} />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Should contain phase with git operations
    expect(xml).toContain('<phase name="development"')
    expect(xml).toContain('<git-commit')
    expect(xml).toContain('<git-notes')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-git-inside-phase',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
      },
      errors: [],
    })
  })

  // ============================================================================
  // MISSING TEST COVERAGE - test.todo()
  // ============================================================================

  // Git.Commit tests
  test.todo('Commit with message prop only')
  test.todo('Commit with files prop (specific files)')
  test.todo('Commit with all=true (stage all)')
  test.todo('Commit with amend=true')
  test.todo('Commit onSuccess callback')
  test.todo('Commit onError callback')
  test.todo('Commit with empty working tree (no changes)')
  test.todo('Commit with merge conflict state')
  test.todo('Commit with hooks enabled')
  test.todo('Commit with hooks disabled (no-verify)')
  test.todo('Commit signed (GPG)')
  test.todo('Commit status transitions: pending -> running -> completed')
  test.todo('Commit status transitions: pending -> running -> error')

  // Git.Notes tests
  test.todo('Notes with arbitrary JSON data')
  test.todo('Notes with nested objects')
  test.todo('Notes with array data')
  test.todo('Notes commitRef defaults to HEAD')
  test.todo('Notes with specific commitRef')
  test.todo('Notes with invalid commitRef')
  test.todo('Notes append to existing note')
  test.todo('Notes replace existing note')
  test.todo('Notes read operation')

  // Git error handling
  test.todo('Git operation in non-git directory')
  test.todo('Git operation with dirty submodules')
  test.todo('Git operation during rebase')
  test.todo('Git operation during merge')
  test.todo('Git lock file handling')
  test.todo('Git timeout handling')

  // Integration scenarios
  test.todo('Commit followed by Notes on same commit')
  test.todo('Multiple commits in sequence')
  test.todo('Git operations inside Parallel (unsafe, should warn)')
  test.todo('Git mock mode returns fake results')
  test.todo('Git real mode (non-mock) execution')
})

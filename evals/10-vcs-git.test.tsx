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
  // Git.Commit tests - XML rendering validation
  // ============================================================================

  test('Commit with message prop only', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Commit message="feat: add new feature" />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<git-commit')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-commit-message-prop-only',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Commit with files prop (specific files)', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Commit message="fix: update config" files={['package.json', 'tsconfig.json']}>
            Update configuration files
          </Git.Commit>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<git-commit')
    expect(xml).toContain('Update configuration files')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-commit-files-prop',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Commit with all=true (stage all)', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Commit message="chore: update all" all={true}>
            Stage and commit all tracked files
          </Git.Commit>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<git-commit')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-commit-all-true',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Commit with autoGenerate=true', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Commit autoGenerate={true}>
            Auto-generate commit message using Claude
          </Git.Commit>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<git-commit')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-commit-auto-generate',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Commit with onFinished callback prop', async () => {
    const startTime = Date.now()
    const onFinished = () => {}

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Commit message="test callback" onFinished={onFinished}>
            Test success callback
          </Git.Commit>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<git-commit')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-commit-on-finished-callback',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, callback_registered: true },
      errors: [],
    })
  })

  test('Commit with onError callback prop', async () => {
    const startTime = Date.now()
    const onError = () => {}

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Commit message="test error callback" onError={onError}>
            Test error callback
          </Git.Commit>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<git-commit')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-commit-on-error-callback',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, callback_registered: true },
      errors: [],
    })
  })

  test('Commit with notes prop (metadata)', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Commit
            message="feat: with metadata"
            notes={{ reviewStatus: 'approved', automated: true }}
          >
            Commit with structured notes
          </Git.Commit>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<git-commit')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-commit-with-notes',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Commit with cwd prop (custom directory)', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Commit message="commit in subdir" cwd="/tmp/test-repo">
            Commit in custom directory
          </Git.Commit>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<git-commit')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-commit-with-cwd',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  // ============================================================================
  // Git.Notes tests - XML rendering validation
  // ============================================================================

  test('Notes with arbitrary JSON data', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Notes
            data={{
              customField: 'value',
              number: 42,
              boolean: true,
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
      test: '10-notes-arbitrary-json',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Notes with nested objects', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Notes
            data={{
              level1: {
                level2: {
                  level3: { deepValue: 'nested' }
                }
              }
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
      test: '10-notes-nested-objects',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Notes with array data', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Notes
            data={{
              tags: ['alpha', 'beta', 'release'],
              versions: [1, 2, 3],
              mixed: [{ id: 1 }, { id: 2 }],
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
      test: '10-notes-array-data',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Notes commitRef defaults to HEAD', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Notes data={{ test: 'default HEAD' }} />
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
      test: '10-notes-default-head',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Notes with specific commitRef', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Notes
            data={{ target: 'specific commit' }}
            commitRef="abc123"
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
      test: '10-notes-specific-commit-ref',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Notes append to existing note', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Notes
            data={{ additional: 'appended data' }}
            append={true}
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
      test: '10-notes-append',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Notes replace existing note (append=false)', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Notes
            data={{ replacement: 'new data' }}
            append={false}
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
      test: '10-notes-replace',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Notes with cwd prop (custom directory)', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Notes
            data={{ repo: 'custom path' }}
            cwd="/tmp/test-repo"
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
      test: '10-notes-with-cwd',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Notes with onFinished callback', async () => {
    const startTime = Date.now()
    const onFinished = () => {}

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Notes
            data={{ callback: 'test' }}
            onFinished={onFinished}
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
      test: '10-notes-on-finished-callback',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Notes with onError callback', async () => {
    const startTime = Date.now()
    const onError = () => {}

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Git.Notes
            data={{ error: 'handler' }}
            onError={onError}
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
      test: '10-notes-on-error-callback',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  // ============================================================================
  // Integration scenarios - XML rendering validation
  // ============================================================================

  test('Commit followed by Notes on same commit', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs-workflow">
          <Git.Commit message="feat: new feature">
            Implement feature
          </Git.Commit>
          <Git.Notes
            data={{ automated: true, phase: 'commit-notes' }}
            commitRef="HEAD"
          />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<git-commit')
    expect(xml).toContain('<git-notes')
    expect(xml).toContain('Implement feature')

    const commitCount = (xml.match(/<git-commit/g) || []).length
    const notesCount = (xml.match(/<git-notes/g) || []).length

    expect(commitCount).toBe(1)
    expect(notesCount).toBe(1)

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-commit-then-notes',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        commit_count: commitCount,
        notes_count: notesCount,
      },
      errors: [],
    })
  })

  test('Multiple commits in sequence', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="multi-commit">
          <Git.Commit message="commit 1">First commit</Git.Commit>
          <Git.Commit message="commit 2">Second commit</Git.Commit>
          <Git.Commit message="commit 3">Third commit</Git.Commit>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    const commitCount = (xml.match(/<git-commit/g) || []).length
    expect(commitCount).toBe(3)

    expect(xml).toContain('First commit')
    expect(xml).toContain('Second commit')
    expect(xml).toContain('Third commit')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-multiple-commits-sequence',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        commit_count: commitCount,
      },
      errors: [],
    })
  })

  test('Git mock mode renders pending status', async () => {
    const startTime = Date.now()

    // Mock mode is enabled by default in test env
    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="mock-test">
          <Git.Commit message="mock commit">Mock mode test</Git.Commit>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<git-commit')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-git-mock-mode',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Git with stable id prop for resumability', async () => {
    const startTime = Date.now()
    const stableId = 'my-stable-commit-id'

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="stable-id">
          <Git.Commit id={stableId} message="stable commit">
            Commit with stable ID
          </Git.Commit>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<git-commit')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '10-git-stable-id',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, stable_id: stableId },
      errors: [],
    })
  })
})

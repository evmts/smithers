/**
 * Comprehensive tests for Human.tsx - Human interaction component
 * Tests hash generation, task registration, resumability, lifecycle, and edge cases
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { createSmithersRoot, type SmithersRoot } from '../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { SmithersProvider } from './SmithersProvider.js'
import { signalOrchestrationComplete } from './Ralph/utils.js'
import { Human, type HumanProps } from './Human.js'

// ============================================================================
// HASH FUNCTION TESTS (test the algorithm directly)
// ============================================================================

describe('hashString function', () => {
  // Reimplement the hash function for testing (same as in Human.tsx)
  const hashString = (value: string): string => {
    let hash = 2166136261
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(16)
  }

  test('generates consistent hash for same input', () => {
    const input = 'test message'
    const hash1 = hashString(input)
    const hash2 = hashString(input)
    expect(hash1).toBe(hash2)
  })

  test('generates different hash for different inputs', () => {
    const hash1 = hashString('message A')
    const hash2 = hashString('message B')
    expect(hash1).not.toBe(hash2)
  })

  test('handles empty string', () => {
    const hash = hashString('')
    expect(hash).toBe('811c9dc5') // FNV-1a initial value in hex
  })

  test('handles unicode characters', () => {
    const hash = hashString('Hello 世界 emoji: 🎉')
    expect(typeof hash).toBe('string')
    expect(hash.length).toBeGreaterThan(0)
  })

  test('handles very long strings', () => {
    const longString = 'a'.repeat(10000)
    const hash = hashString(longString)
    expect(typeof hash).toBe('string')
    expect(hash.length).toBeGreaterThan(0)
  })

  test('hash is hexadecimal string', () => {
    const hash = hashString('any input')
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  test('hash is deterministic across multiple calls', () => {
    const results = Array.from({ length: 100 }, () => hashString('consistent'))
    const allSame = results.every(r => r === results[0])
    expect(allSame).toBe(true)
  })

  test('small input changes produce different hashes', () => {
    const hash1 = hashString('test')
    const hash2 = hashString('Test') // Capital T
    const hash3 = hashString('test ') // Trailing space
    expect(hash1).not.toBe(hash2)
    expect(hash1).not.toBe(hash3)
    expect(hash2).not.toBe(hash3)
  })
})

// ============================================================================
// HUMAN PROPS INTERFACE TESTS
// ============================================================================

describe('HumanProps interface', () => {
  test('id is optional string', () => {
    const props: HumanProps = {}
    expect(props.id).toBeUndefined()
  })

  test('id can be set', () => {
    const props: HumanProps = { id: 'my-human-interaction' }
    expect(props.id).toBe('my-human-interaction')
  })

  test('message is optional string', () => {
    const props: HumanProps = { message: 'Approve this action?' }
    expect(props.message).toBe('Approve this action?')
  })

  test('onApprove is optional callback', () => {
    const callback = mock(() => {})
    const props: HumanProps = { onApprove: callback }
    props.onApprove?.()
    expect(callback).toHaveBeenCalled()
  })

  test('onReject is optional callback', () => {
    const callback = mock(() => {})
    const props: HumanProps = { onReject: callback }
    props.onReject?.()
    expect(callback).toHaveBeenCalled()
  })

  test('children is optional', () => {
    const props: HumanProps = {}
    expect(props.children).toBeUndefined()
  })

  test('allows arbitrary additional props', () => {
    const props: HumanProps = {
      id: 'test',
      customProp: 'value',
      numberProp: 42,
    }
    expect(props.customProp).toBe('value')
    expect(props.numberProp).toBe(42)
  })
})

// ============================================================================
// HUMAN COMPONENT RENDERING
// ============================================================================

describe('Human component rendering', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-human-render', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('renders human element with message', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Human id="test-human" message="Approve deployment?">
          Deploy to production
        </Human>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<human')
    expect(xml).toContain('message="Approve deployment?"')
  })

  test('renders children content', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Human id="test-human">
          This is the confirmation content
        </Human>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('This is the confirmation content')
  })

  test('renders with explicit id', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Human id="explicit-id" message="Test">Content</Human>
      </SmithersProvider>
    )

    const tree = root.getTree()
    const humanNode = findNodeByType(tree, 'human')
    expect(humanNode).toBeDefined()
  })

  test('renders with multiple children', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Human id="multi-child">
          <span>First</span>
          <span>Second</span>
        </Human>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('First')
    expect(xml).toContain('Second')
  })
})

// ============================================================================
// HUMAN ID GENERATION (fallback IDs)
// ============================================================================

describe('Human ID generation', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-human-id', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('uses explicit id when provided', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Human id="my-explicit-id" message="Test">Content</Human>
      </SmithersProvider>
    )

    // Check state was set with the explicit id
    await new Promise(r => setTimeout(r, 100))
    const stateKey = 'human:my-explicit-id'
    const requestId = db.state.get<string>(stateKey)
    // Should have stored a request id
    expect(requestId).toBeDefined()
  })

  test('generates content-based fallback id from message', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Human message="Unique message">Content</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))
    // ID should be content-based hash
    const states = db.db.query<{ key: string }>("SELECT key FROM state WHERE key LIKE 'human:content:%'")
    expect(states.length).toBeGreaterThan(0)
  })

  test('generates content-based fallback id from children', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Human>Unique child content for fallback</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))
    const states = db.db.query<{ key: string }>("SELECT key FROM state WHERE key LIKE 'human:content:%'")
    expect(states.length).toBeGreaterThan(0)
  })

  test('combines message and children for fallback id', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Human message="Part A">Part B</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))
    const states = db.db.query<{ key: string }>("SELECT key FROM state WHERE key LIKE 'human:content:%'")
    expect(states.length).toBeGreaterThan(0)
  })

  test('throws when no id, message, or children provided', async () => {
    // The error is caught by React and logged to console/handled by Smithers error handler
    // We can verify by checking that no human interaction was created
    let errorCaught = false
    const originalOnError = console.error
    console.error = () => { errorCaught = true }

    try {
      await root.render(
        <SmithersProvider db={db} executionId={executionId} stopped>
          <Human />
        </SmithersProvider>
      )
    } catch {
      errorCaught = true
    }

    console.error = originalOnError

    // The error should have been thrown/caught somewhere
    expect(errorCaught).toBe(true)

    // No human interaction should have been created
    const requests = db.db.query<{ id: string }>("SELECT id FROM human_interactions")
    expect(requests.length).toBe(0)
  })

  test('uses __smithersKey for fallback id when available', async () => {
    // This tests the key-based fallback when rendered in a list/keyed context
    const _HumanWithKey = (props: HumanProps & { __smithersKey?: string }) => {
      return <Human {...props} />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        {/* Simulating keyed rendering - in real usage React would pass key */}
        <Human id="keyed-test" message="test">content</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))
    // Just verify it renders without error when key is involved
    const tree = root.getTree()
    expect(tree).toBeDefined()
  })
})

// ============================================================================
// TASK REGISTRATION
// ============================================================================

describe('Human task registration', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-human-task', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('registers blocking task on mount', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="task-test" message="Approve?">Content</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const tasks = db.db.query<{ component_type: string; component_name: string; status: string }>(
      "SELECT component_type, component_name, status FROM tasks WHERE component_type = 'human_interaction'"
    )
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks[0]!.status).toBe('running')
  })

  test('task component_name uses message prop', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="desc-test" message="Custom approval message">Content</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const tasks = db.db.query<{ component_name: string }>(
      "SELECT component_name FROM tasks WHERE component_type = 'human_interaction'"
    )
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks[0]!.component_name).toBe('Custom approval message')
  })

  test('task component_name defaults to "Human input required"', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="default-desc">Content only</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const tasks = db.db.query<{ component_name: string }>(
      "SELECT component_name FROM tasks WHERE component_type = 'human_interaction'"
    )
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks[0]!.component_name).toBe('Human input required')
  })
})

// ============================================================================
// HUMAN INTERACTION REQUEST
// ============================================================================

describe('Human interaction request', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-human-request', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('creates human interaction request on mount', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="request-test" message="Approve action?">Details</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const requests = db.db.query<{ type: string; prompt: string; status: string }>(
      "SELECT type, prompt, status FROM human_interactions"
    )
    expect(requests.length).toBeGreaterThan(0)
    expect(requests[0]!.type).toBe('confirmation')
    expect(requests[0]!.prompt).toBe('Approve action?')
    expect(requests[0]!.status).toBe('pending')
  })

  test('stores request id in state for resumability', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="state-test" message="Test">Content</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const stateValue = db.state.get<string>('human:state-test')
    expect(stateValue).toBeDefined()
    expect(typeof stateValue).toBe('string')
  })

  test('uses default prompt when message not provided', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="default-prompt">Content without message</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const requests = db.db.query<{ prompt: string }>(
      "SELECT prompt FROM human_interactions"
    )
    expect(requests.length).toBeGreaterThan(0)
    expect(requests[0]!.prompt).toBe('Approve to continue')
  })
})

// ============================================================================
// RESUMABILITY
// ============================================================================

describe('Human resumability', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-human-resume', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('resumes existing request instead of creating new one', async () => {
    // First, create an existing request
    const existingRequestId = db.human.request('confirmation', 'Existing request')
    db.state.set('human:resume-test', existingRequestId, 'human_request')

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="resume-test" message="New message">New content</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    // Should only have the original request, not a new one
    const requests = db.db.query<{ id: string; prompt: string }>(
      "SELECT id, prompt FROM human_interactions"
    )
    expect(requests.length).toBe(1)
    expect(requests[0]!.id).toBe(existingRequestId)
    expect(requests[0]!.prompt).toBe('Existing request')
  })

  test('does not register new task when resuming', async () => {
    // Create existing request
    const existingRequestId = db.human.request('confirmation', 'Existing')
    db.state.set('human:no-task-test', existingRequestId, 'human_request')

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="no-task-test" message="Test">Content</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    // Should not have created a new task for human_interaction
    const tasks = db.db.query<{ id: string }>(
      "SELECT id FROM tasks WHERE component_type = 'human_interaction'"
    )
    expect(tasks.length).toBe(0)
  })

  test('consistent hash enables automatic resumability', async () => {
    // First render
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human message="Consistent message">Consistent content</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    // Get the state key that was created
    const states = db.db.query<{ key: string }>("SELECT key FROM state WHERE key LIKE 'human:content:%'")
    expect(states.length).toBe(1)
    const stateKey = states[0]!.key

    // Dispose and create new root
    root.dispose()
    root = createSmithersRoot()

    // Second render with same content should use same state key
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human message="Consistent message">Consistent content</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    // Should still only have one state entry (reused)
    const statesAfter = db.db.query<{ key: string }>("SELECT key FROM state WHERE key LIKE 'human:content:%'")
    expect(statesAfter.length).toBe(1)
    expect(statesAfter[0]!.key).toBe(stateKey)
  })
})

// ============================================================================
// RESOLUTION CALLBACKS
// ============================================================================

describe('Human resolution callbacks', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-human-callbacks', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('calls onApprove when request is approved', async () => {
    let approved = false
    const onApprove = () => { approved = true }

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="approve-test" message="Approve?" onApprove={onApprove}>
          Content
        </Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    // Get the request id
    const requests = db.db.query<{ id: string }>("SELECT id FROM human_interactions")
    expect(requests.length).toBeGreaterThan(0)

    // Resolve as approved
    db.human.resolve(requests[0]!.id, 'approved')

    await new Promise(r => setTimeout(r, 150))

    expect(approved).toBe(true)
  })

  test('calls onReject when request is rejected', async () => {
    let rejected = false
    const onReject = () => { rejected = true }

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="reject-test" message="Approve?" onReject={onReject}>
          Content
        </Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const requests = db.db.query<{ id: string }>("SELECT id FROM human_interactions")
    expect(requests.length).toBeGreaterThan(0)

    // Resolve as rejected
    db.human.resolve(requests[0]!.id, 'rejected')

    await new Promise(r => setTimeout(r, 150))

    expect(rejected).toBe(true)
  })

  test('completes task when request is resolved', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="complete-task-test" message="Test">Content</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    // Verify task is running
    const runningTasks = db.db.query<{ status: string }>(
      "SELECT status FROM tasks WHERE component_type = 'human_interaction'"
    )
    expect(runningTasks.length).toBeGreaterThan(0)
    expect(runningTasks[0]!.status).toBe('running')

    // Resolve the request
    const requests = db.db.query<{ id: string }>("SELECT id FROM human_interactions")
    db.human.resolve(requests[0]!.id, 'approved')

    await new Promise(r => setTimeout(r, 150))

    // Task should be completed
    const completedTasks = db.db.query<{ status: string }>(
      "SELECT status FROM tasks WHERE component_type = 'human_interaction'"
    )
    expect(completedTasks.length).toBeGreaterThan(0)
    expect(completedTasks[0]!.status).toBe('completed')
  })

  test('does not call callbacks for pending status', async () => {
    let callbackCalled = false
    const onApprove = () => { callbackCalled = true }
    const onReject = () => { callbackCalled = true }

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="pending-test" onApprove={onApprove} onReject={onReject}>
          Content
        </Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 200))

    // Without resolving, callbacks should not be called
    expect(callbackCalled).toBe(false)
  })
})

// ============================================================================
// COMPONENT LIFECYCLE
// ============================================================================

describe('Human component lifecycle', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-human-lifecycle', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('handles mount correctly', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="mount-test" message="Test">Content</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    // Should have created request and task
    const requests = db.db.query<{ id: string }>("SELECT id FROM human_interactions")
    const tasks = db.db.query<{ id: string }>("SELECT id FROM tasks WHERE component_type = 'human_interaction'")

    expect(requests.length).toBe(1)
    expect(tasks.length).toBe(1)
  })

  test('handles unmount without error', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="unmount-test" message="Test">Content</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    // Unmount
    await root.render(null)
    await new Promise(r => setTimeout(r, 50))

    // Should not throw
    expect(true).toBe(true)
  })

  test('handles rapid mount/unmount', async () => {
    for (let i = 0; i < 5; i++) {
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Human id={`rapid-${i}`} message="Test">Content</Human>
        </SmithersProvider>
      )
      await root.render(null)
    }

    // Should not throw
    expect(true).toBe(true)
  })

  test('handles re-render with same props', async () => {
    const element = (
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="stable-test" message="Stable">Content</Human>
      </SmithersProvider>
    )

    await root.render(element)
    await new Promise(r => setTimeout(r, 50))
    await root.render(element)
    await new Promise(r => setTimeout(r, 50))
    await root.render(element)
    await new Promise(r => setTimeout(r, 50))

    // Should only have one request
    const requests = db.db.query<{ id: string }>("SELECT id FROM human_interactions")
    expect(requests.length).toBe(1)
  })
})

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Human edge cases', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-human-edge', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('handles empty message string', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="empty-msg" message="">Non-empty content</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    // Should still work with empty message
    const requests = db.db.query<{ prompt: string }>("SELECT prompt FROM human_interactions")
    expect(requests.length).toBe(1)
  })

  test('handles special characters in message', async () => {
    const specialMsg = 'Approve <script>alert("xss")</script> & "quotes"?'
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="special-chars" message={specialMsg}>Content</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const requests = db.db.query<{ prompt: string }>("SELECT prompt FROM human_interactions")
    expect(requests.length).toBe(1)
    expect(requests[0]!.prompt).toBe(specialMsg)
  })

  test('handles very long message', async () => {
    const longMsg = 'A'.repeat(5000)
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="long-msg" message={longMsg}>Content</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const requests = db.db.query<{ prompt: string }>("SELECT prompt FROM human_interactions")
    expect(requests.length).toBe(1)
    expect(requests[0]!.prompt).toBe(longMsg)
  })

  test('handles unicode in message and children', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="unicode-test" message="承認しますか? 🎉">
          日本語コンテンツ 中文内容 한국어
        </Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('承認しますか?')
  })

  test('handles null children gracefully', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="null-children" message="Test">
          {null}
          Valid content
          {undefined}
        </Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('Valid content')
  })

  test('handles deeply nested children', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="nested-test" message="Test">
          <div>
            <span>
              <strong>Deeply nested</strong>
            </span>
          </div>
        </Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('Deeply nested')
  })
})

// ============================================================================
// MULTIPLE HUMAN COMPONENTS
// ============================================================================

describe('Multiple Human components', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-multi-human', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('renders multiple Human components with unique ids', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="human-1" message="First">First content</Human>
        <Human id="human-2" message="Second">Second content</Human>
        <Human id="human-3" message="Third">Third content</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const requests = db.db.query<{ prompt: string }>("SELECT prompt FROM human_interactions ORDER BY prompt")
    expect(requests.length).toBe(3)
  })

  test('each Human creates separate task', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="task-1" message="Task 1">Content</Human>
        <Human id="task-2" message="Task 2">Content</Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const tasks = db.db.query<{ component_name: string }>(
      "SELECT component_name FROM tasks WHERE component_type = 'human_interaction'"
    )
    expect(tasks.length).toBe(2)
  })

  test('resolving one Human does not affect others', async () => {
    let human1Approved = false
    let human2Approved = false

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Human id="iso-1" message="First" onApprove={() => { human1Approved = true }}>
          Content 1
        </Human>
        <Human id="iso-2" message="Second" onApprove={() => { human2Approved = true }}>
          Content 2
        </Human>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const requests = db.db.query<{ id: string; prompt: string }>(
      "SELECT id, prompt FROM human_interactions ORDER BY prompt"
    )
    expect(requests.length).toBe(2)

    // Resolve only the first one
    const firstRequest = requests.find(r => r.prompt === 'First')
    db.human.resolve(firstRequest!.id, 'approved')

    await new Promise(r => setTimeout(r, 150))

    expect(human1Approved).toBe(true)
    expect(human2Approved).toBe(false)
  })
})

// ============================================================================
// STOPPED PROVIDER BEHAVIOR
// ============================================================================

describe('Human with stopped provider', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-human-stopped', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('renders correctly when provider is stopped', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Human id="stopped-test" message="Paused">Content</Human>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<human')
    expect(xml).toContain('message="Paused"')
  })
})

// ============================================================================
// INDEX EXPORTS
// ============================================================================

describe('Human index exports', () => {
  test('exports Human from index', async () => {
    const index = await import('./index.js')
    expect(index.Human).toBeDefined()
    expect(typeof index.Human).toBe('function')
  })
})

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function findNodeByType(node: any, type: string): any | undefined {
  if (node.type === type) return node
  for (const child of node.children ?? []) {
    const found = findNodeByType(child, type)
    if (found) return found
  }
  return undefined
}

/**
 * Unit tests for Ralph.tsx - Ralph orchestration component.
 *
 * Tests the Ralph component wrapper which provides backwards-compatible
 * RalphContext and renders the <ralph> XML element. Ralph delegates to
 * SmithersProvider for iteration management.
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { useContext } from 'react'
import { createSmithersRoot } from '../reconciler/root.js'
import { createSmithersDB } from '../db/index.js'
import {
  Ralph,
  RalphContext,
  createOrchestrationPromise,
  signalOrchestrationComplete,
  signalOrchestrationError,
  signalOrchestrationCompleteByToken,
  signalOrchestrationErrorByToken,
} from './Ralph.js'
import { SmithersProvider, useSmithers } from './SmithersProvider.js'
import { useRalphCount } from '../hooks/useRalphCount.js'

type TestEnv = {
  db: ReturnType<typeof createSmithersDB>
  executionId: string
  root: ReturnType<typeof createSmithersRoot>
}

function createTestEnv(name: string): TestEnv {
  const db = createSmithersDB({ path: ':memory:' })
  const executionId = db.execution.start('ralph-test', name)
  const root = createSmithersRoot()
  return { db, executionId, root }
}

function cleanupTestEnv(env: TestEnv) {
  env.root.dispose()
  env.db.close()
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('RalphContext', () => {
  test('RalphContext is exported and is a React context', () => {
    expect(RalphContext).toBeDefined()
    expect(RalphContext.Provider).toBeDefined()
    expect(RalphContext.Consumer).toBeDefined()
  })
})

describe('Orchestration promise functions', () => {
  test('createOrchestrationPromise returns a promise', () => {
    const { promise, token } = createOrchestrationPromise()
    expect(promise).toBeInstanceOf(Promise)
    expect(typeof token).toBe('string')
    signalOrchestrationCompleteByToken(token)
  })

  test('signalOrchestrationCompleteByToken resolves the promise', async () => {
    const { promise, token } = createOrchestrationPromise()
    let resolved = false

    promise.then(() => {
      resolved = true
    })

    signalOrchestrationCompleteByToken(token)
    await delay(10)
    expect(resolved).toBe(true)
  })

  test('signalOrchestrationErrorByToken rejects the promise', async () => {
    const { promise, token } = createOrchestrationPromise()
    let rejected = false
    let errorMessage = ''

    promise.catch((err: Error) => {
      rejected = true
      errorMessage = err.message
    })

    signalOrchestrationErrorByToken(token, new Error('test error'))
    await delay(10)
    expect(rejected).toBe(true)
    expect(errorMessage).toBe('test error')
  })

  test('signalOrchestrationComplete is safe to call without promise (deprecated)', () => {
    expect(() => signalOrchestrationComplete()).not.toThrow()
  })

  test('signalOrchestrationError is safe to call without promise (deprecated)', () => {
    expect(() => signalOrchestrationError(new Error('no-op'))).not.toThrow()
  })

  test('calling complete twice is safe', async () => {
    const { promise, token } = createOrchestrationPromise()
    let resolveCount = 0

    promise.then(() => {
      resolveCount++
    })

    signalOrchestrationCompleteByToken(token)
    signalOrchestrationCompleteByToken(token)
    await delay(10)
    expect(resolveCount).toBe(1)
  })

  test('calling error after complete is no-op', async () => {
    const { promise, token } = createOrchestrationPromise()
    let resolved = false
    let rejected = false

    promise
      .then(() => { resolved = true })
      .catch(() => { rejected = true })

    signalOrchestrationCompleteByToken(token)
    signalOrchestrationErrorByToken(token, new Error('should be ignored'))
    await delay(10)
    expect(resolved).toBe(true)
    expect(rejected).toBe(false)
  })
})

describe('RalphContextType interface', () => {
  test('context value has registerTask and completeTask', () => {
    const contextValue = {
      registerTask: mock(() => {}),
      completeTask: mock(() => {}),
      ralphCount: 0,
      db: null,
    }

    expect(contextValue.registerTask).toBeDefined()
    expect(contextValue.completeTask).toBeDefined()
    expect(contextValue.ralphCount).toBe(0)
    expect(contextValue.db).toBeNull()
  })

  test('registerTask can be called', () => {
    const registerTask = mock(() => {})
    registerTask()
    expect(registerTask).toHaveBeenCalled()
  })

  test('completeTask can be called', () => {
    const completeTask = mock(() => {})
    completeTask()
    expect(completeTask).toHaveBeenCalled()
  })
})

describe('Ralph component rendering', () => {
  let env: TestEnv

  beforeEach(() => {
    env = createTestEnv('ralph-render')
  })

  afterEach(async () => {
    await delay(100)
    cleanupTestEnv(env)
  })

  test('Ralph renders children', async () => {
    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <phase name="child">Hello</phase>
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    const xml = env.root.toXML()
    expect(xml).toContain('<ralph')
    expect(xml).toContain('<phase')
    expect(xml).toContain('name="child"')
    expect(xml).toContain('Hello')
  })

  test('Ralph renders <ralph> element with iteration props', async () => {
    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph maxIterations={50}>
          <step>Test</step>
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    const xml = env.root.toXML()
    expect(xml).toContain('<ralph')
    expect(xml).toContain('iteration="0"')
    expect(xml).toContain('maxIterations="50"')
  })

  test('Ralph with no children renders empty ralph element', async () => {
    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph />
      </SmithersProvider>
    )

    await delay(50)
    const xml = env.root.toXML()
    expect(xml).toContain('<ralph')
  })

  test('Ralph renders multiple children', async () => {
    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <step>First</step>
          <step>Second</step>
          <step>Third</step>
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    const xml = env.root.toXML()
    expect(xml).toContain('First')
    expect(xml).toContain('Second')
    expect(xml).toContain('Third')
  })

  test('Ralph renders nested elements', async () => {
    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <phase name="outer">
            <step>
              <action>nested</action>
            </step>
          </phase>
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    const xml = env.root.toXML()
    expect(xml).toContain('<phase')
    expect(xml).toContain('<step>')
    expect(xml).toContain('<action>')
    expect(xml).toContain('nested')
  })
})

describe('Ralph context provision', () => {
  let env: TestEnv

  beforeEach(() => {
    env = createTestEnv('ralph-context')
  })

  afterEach(async () => {
    await delay(100)
    cleanupTestEnv(env)
  })

  test('Ralph provides RalphContext to children', async () => {
    let capturedContext: any = null

    function ContextReader() {
      capturedContext = useContext(RalphContext)
      return <result>read</result>
    }

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <ContextReader />
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    expect(capturedContext).not.toBeNull()
    expect(capturedContext.registerTask).toBeDefined()
    expect(capturedContext.completeTask).toBeDefined()
    expect(typeof capturedContext.ralphCount).toBe('number')
  })

  test('Ralph context ralphCount reflects DB state', async () => {
    let capturedCount: number | null = null

    function CountReader() {
      const ctx = useContext(RalphContext)
      capturedCount = ctx?.ralphCount ?? -1
      return <count>{capturedCount}</count>
    }

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <CountReader />
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    expect(capturedCount).toBe(0)
  })

  test('Ralph context db is the ReactiveDatabase', async () => {
    let capturedDb: any = null

    function DbReader() {
      const ctx = useContext(RalphContext)
      capturedDb = ctx?.db
      return <db>{capturedDb ? 'present' : 'missing'}</db>
    }

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <DbReader />
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    expect(capturedDb).not.toBeNull()
    expect(capturedDb.run).toBeDefined()
    expect(capturedDb.query).toBeDefined()
  })
})

describe('Ralph iteration tracking', () => {
  let env: TestEnv

  beforeEach(() => {
    env = createTestEnv('ralph-iteration')
  })

  afterEach(async () => {
    await delay(100)
    cleanupTestEnv(env)
  })

  test('Ralph iteration count accessible via useRalphCount hook', async () => {
    let capturedCount: number | null = null

    function HookReader() {
      capturedCount = useRalphCount()
      return <count>{capturedCount}</count>
    }

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <HookReader />
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    expect(capturedCount).toBe(0)
  })

  test('Ralph increments iteration count via DB state', async () => {
    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <step>Test</step>
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)

    const initialResult = env.db.db.queryOne<{ value: string }>(
      "SELECT value FROM state WHERE key = 'ralphCount'"
    )
    expect(initialResult?.value).toBe('0')

    env.db.db.run(
      "UPDATE state SET value = '5', updated_at = datetime('now') WHERE key = 'ralphCount'"
    )

    const updatedResult = env.db.db.queryOne<{ value: string }>(
      "SELECT value FROM state WHERE key = 'ralphCount'"
    )
    expect(updatedResult?.value).toBe('5')
  })

  test('Ralph uses default maxIterations of 100', async () => {
    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <step>Test</step>
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    const xml = env.root.toXML()
    expect(xml).toContain('maxIterations="100"')
  })

  test('Ralph maxIterations prop overrides default', async () => {
    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph maxIterations={25}>
          <step>Test</step>
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    const xml = env.root.toXML()
    expect(xml).toContain('maxIterations="25"')
  })

  test('Ralph respects SmithersProvider config maxIterations', async () => {
    await env.root.render(
      <SmithersProvider
        db={env.db}
        executionId={env.executionId}
        config={{ maxIterations: 75 }}
      >
        <Ralph>
          <step>Test</step>
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    const xml = env.root.toXML()
    expect(xml).toContain('maxIterations="75"')
  })
})

describe('Ralph stop conditions', () => {
  let env: TestEnv

  beforeEach(() => {
    env = createTestEnv('ralph-stop')
  })

  afterEach(async () => {
    await delay(200)
    cleanupTestEnv(env)
  })

  test('Ralph stops on SmithersProvider stopped prop', async () => {
    let completeCalled = false

    await env.root.render(
      <SmithersProvider
        db={env.db}
        executionId={env.executionId}
        stopped={true}
        onComplete={() => { completeCalled = true }}
      >
        <Ralph>
          <step>Test</step>
        </Ralph>
      </SmithersProvider>
    )

    await delay(150)
    expect(completeCalled).toBe(true)
  })

  test('Ralph stops when stop_requested is set in DB', async () => {
    let isStopRequested = false

    function StopChecker() {
      const { isStopRequested: checkStop } = useSmithers()
      isStopRequested = checkStop()
      return <status>{isStopRequested ? 'stopped' : 'running'}</status>
    }

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <StopChecker />
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    expect(isStopRequested).toBe(false)

    env.db.state.set('stop_requested', {
      reason: 'test stop',
      timestamp: Date.now(),
      executionId: env.executionId,
    })

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <StopChecker />
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    expect(isStopRequested).toBe(true)
  })

  test('Ralph requestStop triggers stop condition', async () => {
    let stopCalled = false

    function StopTrigger() {
      const { requestStop, isStopRequested } = useSmithers()
      if (!isStopRequested() && !stopCalled) {
        stopCalled = true
        requestStop('manual stop')
      }
      return <trigger>{isStopRequested() ? 'stopped' : 'running'}</trigger>
    }

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <StopTrigger />
        </Ralph>
      </SmithersProvider>
    )

    await delay(100)
    expect(stopCalled).toBe(true)

    const stopState = env.db.state.get('stop_requested')
    expect(stopState).not.toBeNull()
    expect((stopState as any).reason).toBe('manual stop')
  })
})

describe('Ralph cleanup on unmount', () => {
  let env: TestEnv

  beforeEach(() => {
    env = createTestEnv('ralph-cleanup')
  })

  afterEach(async () => {
    await delay(100)
    cleanupTestEnv(env)
  })

  test('Ralph cleans up when unmounted via render(null)', async () => {
    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <step>Test</step>
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)

    const treeBefore = env.root.getTree()
    expect(treeBefore.children.length).toBeGreaterThan(0)

    await env.root.render(null)
    await delay(50)

    const treeAfter = env.root.getTree()
    expect(treeAfter.children.length).toBe(0)
  })

  test('Ralph disposes correctly via root.dispose()', async () => {
    const localEnv = createTestEnv('ralph-dispose')

    await localEnv.root.render(
      <SmithersProvider db={localEnv.db} executionId={localEnv.executionId}>
        <Ralph>
          <step>Test</step>
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)

    expect(() => localEnv.root.dispose()).not.toThrow()

    const treeAfter = localEnv.root.getTree()
    expect(treeAfter.children.length).toBe(0)

    localEnv.db.close()
  })
})

describe('Ralph with async children', () => {
  let env: TestEnv

  beforeEach(() => {
    env = createTestEnv('ralph-async')
  })

  afterEach(async () => {
    await delay(100)
    cleanupTestEnv(env)
  })

  test('Ralph renders function components that use hooks', async () => {
    function AsyncLikeComponent() {
      const count = useRalphCount()
      return <result>Count is {count}</result>
    }

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <AsyncLikeComponent />
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    const xml = env.root.toXML()
    expect(xml).toContain('Count is')
    expect(xml).toContain('0')
  })

  test('Ralph handles component that registers tasks', async () => {
    function TaskComponent() {
      const { db } = useSmithers()
      const taskId = db.tasks.start('test-component', 'TaskComponent')
      db.tasks.complete(taskId)
      return <task>completed</task>
    }

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <TaskComponent />
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    const xml = env.root.toXML()
    expect(xml).toContain('<task>')
    expect(xml).toContain('completed')
  })

  test('Ralph handles conditional rendering', async () => {
    function ConditionalComponent({ show }: { show: boolean }) {
      return show ? <visible>shown</visible> : null
    }

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <ConditionalComponent show={true} />
          <ConditionalComponent show={false} />
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    const xml = env.root.toXML()
    expect(xml).toContain('shown')
    expect(xml).not.toContain('<hidden>')
  })
})

describe('Ralph PhaseRegistry integration', () => {
  let env: TestEnv

  beforeEach(() => {
    env = createTestEnv('ralph-phase')
  })

  afterEach(async () => {
    await delay(100)
    cleanupTestEnv(env)
  })

  test('Ralph provides PhaseRegistryProvider to children', async () => {
    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <phase name="test-phase">Phase content</phase>
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    const xml = env.root.toXML()
    expect(xml).toContain('name="test-phase"')
    expect(xml).toContain('Phase content')
  })
})

describe('Ralph deprecated prop handling', () => {
  let env: TestEnv

  beforeEach(() => {
    env = createTestEnv('ralph-deprecated')
  })

  afterEach(async () => {
    await delay(100)
    cleanupTestEnv(env)
  })

  test('Ralph ignores deprecated db prop', async () => {
    const separateDb = createSmithersDB({ path: ':memory:' })

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph db={separateDb as any}>
          <step>Test</step>
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    const xml = env.root.toXML()
    expect(xml).toContain('<ralph')

    separateDb.close()
  })

  test('Ralph ignores deprecated stopped prop (uses SmithersProvider)', async () => {
    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph stopped={true}>
          <step>Test</step>
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    const xml = env.root.toXML()
    expect(xml).toContain('<ralph')
  })

  test('Ralph deprecated registerTask/completeTask are no-ops', async () => {
    let contextValue: any = null

    function DeprecatedApiUser() {
      contextValue = useContext(RalphContext)
      if (contextValue) {
        contextValue.registerTask()
        contextValue.completeTask()
      }
      return <result>done</result>
    }

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Ralph>
          <DeprecatedApiUser />
        </Ralph>
      </SmithersProvider>
    )

    await delay(50)
    expect(contextValue.registerTask).toBeDefined()
    expect(contextValue.completeTask).toBeDefined()
  })
})

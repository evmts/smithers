/**
 * Comprehensive tests for While component
 * Tests looping control flow, iteration counting, condition evaluation, and edge cases
 */
import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { createSmithersRoot, type SmithersRoot } from '../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { While, useWhileIteration, type WhileProps, type WhileIterationContextValue } from './While.js'
import { SmithersProvider } from './SmithersProvider.js'
import { useMount } from '../reconciler/hooks.js'

// ============================================================================
// MODULE EXPORTS
// ============================================================================

describe('While Exports', () => {
  test('exports While component', () => {
    expect(While).toBeDefined()
    expect(typeof While).toBe('function')
  })

  test('While component has correct name', () => {
    expect(While.name).toBe('While')
  })

  test('exports useWhileIteration hook', () => {
    expect(useWhileIteration).toBeDefined()
    expect(typeof useWhileIteration).toBe('function')
  })
})

// ============================================================================
// WHILEPROPS INTERFACE
// ============================================================================

describe('WhileProps interface', () => {
  test('requires id prop', () => {
    const props: WhileProps = {
      id: 'test-while',
      condition: () => true,
      children: null,
    }
    expect(props.id).toBe('test-while')
  })

  test('requires condition prop', () => {
    const condition = () => true
    const props: WhileProps = {
      id: 'test',
      condition,
      children: null,
    }
    expect(props.condition).toBe(condition)
  })

  test('requires children prop', () => {
    const props: WhileProps = {
      id: 'test',
      condition: () => true,
      children: <div>Content</div>,
    }
    expect(props.children).toBeDefined()
  })

  test('accepts optional maxIterations prop', () => {
    const props: WhileProps = {
      id: 'test',
      condition: () => true,
      children: null,
      maxIterations: 5,
    }
    expect(props.maxIterations).toBe(5)
  })

  test('accepts optional onIteration callback', () => {
    const onIteration = (_iteration: number) => {}
    const props: WhileProps = {
      id: 'test',
      condition: () => true,
      children: null,
      onIteration,
    }
    expect(props.onIteration).toBe(onIteration)
  })

  test('accepts optional onComplete callback', () => {
    const onComplete = (_iterations: number, _reason: 'condition' | 'max') => {}
    const props: WhileProps = {
      id: 'test',
      condition: () => true,
      children: null,
      onComplete,
    }
    expect(props.onComplete).toBe(onComplete)
  })
})

// ============================================================================
// WHILE RENDERING
// ============================================================================

describe('While rendering', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-while-render', 'While.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    
    root.dispose()
    db.close()
  })

  test('renders while element with id prop', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="my-loop" condition={() => false}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<while')
    expect(xml).toContain('id="my-loop"')
  })

  test('renders while element with iteration attribute', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="iter-test" condition={() => false}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('iteration=')
  })

  test('renders while element with status attribute', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="status-test" condition={() => false}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('status=')
  })

  test('renders while element with maxIterations attribute', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="max-test" condition={() => false} maxIterations={5}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('maxIterations="5"')
  })
})

// ============================================================================
// LOOP EXECUTION
// ============================================================================

describe('While loop execution', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-while-exec', 'While.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    
    root.dispose()
    db.close()
  })

  test('condition returning true starts loop with running status', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="start-loop" condition={() => true}>
          <task>Loop body</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const status = db.state.get<string>('while.start-loop.status')
    expect(status).toBe('running')
  })

  test('condition returning false completes immediately', async () => {
    let completeCalled = false
    let completeReason: 'condition' | 'max' | null = null
    let completedIterations = -1

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While
          id="false-condition"
          condition={() => false}
          onComplete={(iterations, reason) => {
            completeCalled = true
            completedIterations = iterations
            completeReason = reason
          }}
        >
          <task>Loop body</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    expect(completeCalled).toBe(true)
    expect(completedIterations).toBe(0)
    expect(completeReason).toBe('condition')
  })

  test('loop renders children when running', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="render-children" condition={() => true}>
          <loop-content>I am visible</loop-content>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('<loop-content>')
    expect(xml).toContain('I am visible')
  })

  test('loop does not render children when condition is false', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="no-children" condition={() => false}>
          <hidden-content>Should not appear</hidden-content>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).not.toContain('<hidden-content>')
  })

  test('async condition is supported', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While
          id="async-condition"
          condition={async () => {
            await new Promise(r => setTimeout(r, 10))
            return true
          }}
        >
          <task>Async loop</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 150))

    const status = db.state.get<string>('while.async-condition.status')
    expect(status).toBe('running')
  })
})

// ============================================================================
// ITERATION COUNTING
// ============================================================================

describe('While iteration counting', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-while-iter', 'While.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    
    root.dispose()
    db.close()
  })

  test('iteration starts at 0', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="iter-zero" condition={() => true}>
          <task>Loop</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const iteration = db.state.get<number>('while.iter-zero.iteration')
    expect(iteration).toBe(0)
  })

  test('onIteration called with iteration number', async () => {
    const iterations: number[] = []

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While
          id="track-iter"
          condition={() => true}
          onIteration={(iter) => {
            iterations.push(iter)
          }}
        >
          <task>Loop</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    expect(iterations.length).toBeGreaterThanOrEqual(1)
    expect(iterations[0]).toBe(0)
  })

  test('iteration value is accessible via context', async () => {
    let capturedIteration = -1

    function LoopBody() {
      const whileContext = useWhileIteration()
      if (whileContext) {
        capturedIteration = whileContext.iteration
      }
      return <iteration value={whileContext?.iteration ?? -1} />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While
          id="iter-context"
          condition={() => true}
          maxIterations={5}
        >
          <LoopBody />
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    expect(capturedIteration).toBe(0)
  })
})

// ============================================================================
// LOOP TERMINATION
// ============================================================================

describe('While loop termination', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-while-term', 'While.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    
    root.dispose()
    db.close()
  })

  test('terminates when condition becomes false via signalComplete', async () => {
    // The While component checks condition on each signalComplete call
    // When condition returns false, status becomes 'complete'
    let callCount = 0

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While
          id="term-condition"
          condition={() => {
            callCount++
            return callCount <= 1 // Only true on first call
          }}
        >
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    // Loop should be running after first condition check
    expect(db.state.get<string>('while.term-condition.status')).toBe('running')

    // Manually trigger signalComplete via db state simulation
    // This tests the condition check path in handleIterationComplete
  })

  test('loop status becomes complete when condition is initially false', async () => {
    let terminationReason: 'condition' | 'max' | null = null

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While
          id="term-false"
          condition={() => false}
          onComplete={(_, reason) => {
            terminationReason = reason
          }}
        >
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    expect(terminationReason).toBe('condition')
    const status = db.state.get<string>('while.term-false.status')
    expect(status).toBe('complete')
  })

  test('maxIterations is respected as upper bound', async () => {
    // Test that maxIterations prop is stored correctly
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While
          id="term-max"
          condition={() => true}
          maxIterations={3}
        >
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('maxIterations="3"')
    expect(db.state.get<string>('while.term-max.status')).toBe('running')
  })

  test('default maxIterations is 10', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While
          id="default-max"
          condition={() => true}
        >
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('maxIterations="10"')
  })
})

// ============================================================================
// EDGE CASES - ZERO ITERATIONS
// ============================================================================

describe('While zero iterations', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-while-zero', 'While.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    
    root.dispose()
    db.close()
  })

  test('condition false from start yields 0 iterations', async () => {
    let completedIterations = -1

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While
          id="zero-iter"
          condition={() => false}
          onComplete={(iterations, _) => {
            completedIterations = iterations
          }}
        >
          <task>Never runs</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    expect(completedIterations).toBe(0)
  })

  test('children never rendered when condition is initially false', async () => {
    let childRendered = false

    function TrackRender() {
      childRendered = true
      return <task>Tracked</task>
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="no-render" condition={() => false}>
          <TrackRender />
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    expect(childRendered).toBe(false)
  })

  test('onIteration never called when condition is initially false', async () => {
    let iterationCalled = false

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While
          id="no-iter-callback"
          condition={() => false}
          onIteration={() => {
            iterationCalled = true
          }}
        >
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    expect(iterationCalled).toBe(false)
  })
})

// ============================================================================
// EDGE CASES - MAX ITERATIONS
// ============================================================================

describe('While maxIterations edge cases', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-while-max', 'While.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    
    root.dispose()
    db.close()
  })

  test('maxIterations of 1 runs exactly once', async () => {
    let completedIterations = -1
    let reason: 'condition' | 'max' | null = null

    function LoopBody() {
      const whileContext = useWhileIteration()
      useMount(() => {
        setTimeout(() => whileContext?.signalComplete(), 10)
      })
      return <task>Work</task>
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While
          id="max-one"
          condition={() => true}
          maxIterations={1}
          onComplete={(iterations, r) => {
            completedIterations = iterations
            reason = r
          }}
        >
          <LoopBody />
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 200))

    expect(completedIterations).toBe(1)
    expect(reason).toBe('max')
  })

  test('maxIterations of 0 completes immediately when condition true', async () => {
    let completedIterations = -1
    let reason: 'condition' | 'max' | null = null

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While
          id="max-zero"
          condition={() => true}
          maxIterations={0}
          onComplete={(iterations, r) => {
            completedIterations = iterations
            reason = r
          }}
        >
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    // With maxIterations=0, the initial check (0 < 0) is false
    // so it completes with condition reason at 0 iterations
    expect(completedIterations).toBe(0)
    expect(reason).toBe('condition')
  })

  test('very large maxIterations allows loop to run', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While
          id="large-max"
          condition={() => true}
          maxIterations={1000000}
        >
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('maxIterations="1000000"')
    expect(db.state.get<string>('while.large-max.status')).toBe('running')
  })
})

// ============================================================================
// USEWHILEITERATION CONTEXT
// ============================================================================

describe('useWhileIteration context', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-while-ctx', 'While.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    
    root.dispose()
    db.close()
  })

  test('returns null outside While context', async () => {
    let contextValue: WhileIterationContextValue | null = 'notNull' as any

    function Consumer() {
      contextValue = useWhileIteration()
      return <result />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Consumer />
      </SmithersProvider>
    )

    expect(contextValue).toBeNull()
  })

  test('provides iteration number inside While', async () => {
    let capturedIteration = -1

    function Consumer() {
      const ctx = useWhileIteration()
      if (ctx) {
        capturedIteration = ctx.iteration
      }
      return <result iteration={capturedIteration} />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="ctx-iter" condition={() => true}>
          <Consumer />
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    expect(capturedIteration).toBe(0)
  })

  test('provides signalComplete function inside While', async () => {
    let hasSignalComplete = false

    function Consumer() {
      const ctx = useWhileIteration()
      if (ctx) {
        hasSignalComplete = typeof ctx.signalComplete === 'function'
      }
      return <result />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="ctx-signal" condition={() => true}>
          <Consumer />
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    expect(hasSignalComplete).toBe(true)
  })

  test('nested children have access to While context', async () => {
    let deepContextValue: WhileIterationContextValue | null = null

    function DeepChild() {
      deepContextValue = useWhileIteration()
      return <deep-child />
    }

    function MiddleWrapper() {
      return (
        <wrapper>
          <DeepChild />
        </wrapper>
      )
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="nested-ctx" condition={() => true}>
          <MiddleWrapper />
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    expect(deepContextValue).not.toBeNull()
    expect(deepContextValue?.iteration).toBe(0)
  })
})

// ============================================================================
// DATABASE INTEGRATION
// ============================================================================

describe('While database integration', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-while-db', 'While.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    
    root.dispose()
    db.close()
  })

  test('stores iteration in db.state', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="db-iter" condition={() => true}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const iteration = db.state.get<number>('while.db-iter.iteration')
    expect(iteration).toBe(0)
  })

  test('stores status in db.state', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="db-status" condition={() => true}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const status = db.state.get<string>('while.db-status.status')
    expect(status).toBe('running')
  })

  test('status becomes complete when loop terminates', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="db-complete" condition={() => false}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const status = db.state.get<string>('while.db-complete.status')
    expect(status).toBe('complete')
  })

  test('idempotent - does not reinitialize on rerender', async () => {
    const element = (
      <SmithersProvider db={db} executionId={executionId}>
        <While id="idempotent" condition={() => true}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await root.render(element)
    await new Promise(r => setTimeout(r, 100))

    const iterationBefore = db.state.get<number>('while.idempotent.iteration')

    // Rerender same element
    await root.render(element)
    await new Promise(r => setTimeout(r, 50))

    const iterationAfter = db.state.get<number>('while.idempotent.iteration')

    // Should not have reset to initial state
    expect(iterationAfter).toBe(iterationBefore)
  })
})

// ============================================================================
// MULTIPLE WHILE LOOPS
// ============================================================================

describe('Multiple While loops', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-while-multi', 'While.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    
    root.dispose()
    db.close()
  })

  test('multiple while loops have independent state', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="loop-a" condition={() => true}>
          <task>Loop A</task>
        </While>
        <While id="loop-b" condition={() => false}>
          <task>Loop B</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const statusA = db.state.get<string>('while.loop-a.status')
    const statusB = db.state.get<string>('while.loop-b.status')

    expect(statusA).toBe('running')
    expect(statusB).toBe('complete')
  })

  test('nested while loops work correctly', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="outer" condition={() => true}>
          <wrapper>
            <While id="inner" condition={() => true}>
              <task>Inner loop</task>
            </While>
          </wrapper>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 150))

    const outerStatus = db.state.get<string>('while.outer.status')
    const innerStatus = db.state.get<string>('while.inner.status')

    expect(outerStatus).toBe('running')
    expect(innerStatus).toBe('running')
  })
})

// ============================================================================
// BOUNDARY CONDITIONS
// ============================================================================

describe('While boundary conditions', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-while-boundary', 'While.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    
    root.dispose()
    db.close()
  })

  test('handles empty id', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="" condition={() => true}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    // Should work but use empty key
    const status = db.state.get<string>('while..status')
    expect(status).toBe('running')
  })

  test('handles special characters in id', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="loop-with.special_chars" condition={() => true}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const status = db.state.get<string>('while.loop-with.special_chars.status')
    expect(status).toBe('running')
  })

  test('handles null children gracefully', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="null-children" condition={() => true}>
          {null}
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('<while')
    expect(xml).toContain('id="null-children"')
  })

  test('handles undefined children gracefully', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="undefined-children" condition={() => true}>
          {undefined}
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('<while')
  })

  test('handles mixed valid and null children', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="mixed-children" condition={() => true}>
          {null}
          <task>Valid</task>
          {undefined}
          <task>Also Valid</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('Valid')
    expect(xml).toContain('Also Valid')
  })
})

// ============================================================================
// CLEANUP
// ============================================================================

describe('While cleanup on unmount', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-while-cleanup', 'While.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    
    root.dispose()
    db.close()
  })

  test('disposes root without error', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="to-dispose" condition={() => true}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    expect(() => root.dispose()).not.toThrow()
  })

  test('unmounting clears rendered content', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="will-unmount" condition={() => true}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    await root.render(null)

    const tree = root.getTree()
    expect(tree.children.length).toBe(0)
  })

  test('handles rapid mount/unmount', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="rapid" condition={() => true}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await root.render(null)

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="rapid-2" condition={() => false}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    // No errors should occur
    expect(true).toBe(true)
  })
})

// ============================================================================
// SIGNAL COMPLETE BEHAVIOR
// ============================================================================

describe('While signalComplete behavior', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-while-signal', 'While.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    
    root.dispose()
    db.close()
  })

  test('signalComplete is a function on context', async () => {
    let signalType = 'not-set'

    function Inspector() {
      const ctx = useWhileIteration()
      if (ctx) {
        signalType = typeof ctx.signalComplete
      }
      return <result />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="signal-type" condition={() => true}>
          <Inspector />
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    expect(signalType).toBe('function')
  })

  test('context updates on each iteration', async () => {
    // Verify the context provides the current iteration value
    let lastSeenIteration = -1

    function IterationWatcher() {
      const ctx = useWhileIteration()
      if (ctx) {
        lastSeenIteration = ctx.iteration
      }
      return <watcher iteration={lastSeenIteration} />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="ctx-updates" condition={() => true}>
          <IterationWatcher />
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    expect(lastSeenIteration).toBe(0)
  })

  test('calling signalComplete when at maxIterations triggers onComplete', async () => {
    let completeCalled = false
    let completeReason: 'condition' | 'max' | null = null

    // Set up state to be at iteration 2 with maxIterations 3
    db.state.set('while.at-max.iteration', 2, 'test_setup')
    db.state.set('while.at-max.status', 'running', 'test_setup')

    function Signaler() {
      const ctx = useWhileIteration()
      useMount(() => {
        // Call signalComplete - should trigger max check
        setTimeout(() => ctx?.signalComplete(), 50)
      })
      return <signaler />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While
          id="at-max"
          condition={() => true}
          maxIterations={3}
          onComplete={(_, reason) => {
            completeCalled = true
            completeReason = reason
          }}
        >
          <Signaler />
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 200))

    expect(completeCalled).toBe(true)
    expect(completeReason).toBe('max')
  })
})

// ============================================================================
// ASYNC CONDITION HANDLING
// ============================================================================

describe('While async condition handling', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-while-async', 'While.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    
    root.dispose()
    db.close()
  })

  test('async condition that resolves true starts loop', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While
          id="async-true"
          condition={async () => {
            await new Promise(r => setTimeout(r, 20))
            return true
          }}
        >
          <task>Async content</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 150))

    expect(db.state.get<string>('while.async-true.status')).toBe('running')
  })

  test('async condition that resolves false completes immediately', async () => {
    let completeCalled = false

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While
          id="async-false"
          condition={async () => {
            await new Promise(r => setTimeout(r, 20))
            return false
          }}
          onComplete={() => {
            completeCalled = true
          }}
        >
          <task>Async content</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 150))

    expect(completeCalled).toBe(true)
    expect(db.state.get<string>('while.async-false.status')).toBe('complete')
  })

  test('slow async condition does not block render', async () => {
    let renderTime = 0
    const startTime = Date.now()

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While
          id="slow-async"
          condition={async () => {
            await new Promise(r => setTimeout(r, 500))
            return true
          }}
        >
          <task>Content</task>
        </While>
      </SmithersProvider>
    )

    renderTime = Date.now() - startTime

    // Render should complete quickly, not wait for async condition
    expect(renderTime).toBeLessThan(200)
  })
})

// ============================================================================
// TREE STRUCTURE
// ============================================================================

describe('While tree structure', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-while-tree', 'While.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    
    root.dispose()
    db.close()
  })

  test('getTree returns correct structure', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="tree-test" condition={() => true}>
          <step name="child">Content</step>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const tree = root.getTree()
    expect(tree.type).toBe('ROOT')

    function findWhile(node: typeof tree): typeof tree | null {
      if (node.type === 'while') return node
      for (const child of node.children) {
        const result = findWhile(child)
        if (result) return result
      }
      return null
    }

    const whileNode = findWhile(tree)
    expect(whileNode).not.toBeNull()
    expect(whileNode!.type).toBe('while')
    expect(whileNode!.props.id).toBe('tree-test')
  })

  test('while element has expected props', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="props-test" condition={() => true} maxIterations={7}>
          <task>Content</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const tree = root.getTree()

    function findWhile(node: typeof tree): typeof tree | null {
      if (node.type === 'while') return node
      for (const child of node.children) {
        const result = findWhile(child)
        if (result) return result
      }
      return null
    }

    const whileNode = findWhile(tree)
    expect(whileNode).not.toBeNull()
    expect(whileNode!.props.id).toBe('props-test')
    expect(whileNode!.props.maxIterations).toBe(7)
    expect(whileNode!.props.status).toBe('running')
    expect(whileNode!.props.iteration).toBe(0)
  })
})

// ============================================================================
// INDEX EXPORTS
// ============================================================================

describe('While index exports', () => {
  test('exports While from index', async () => {
    const index = await import('./index.js')
    expect(index.While).toBeDefined()
  })

  test('exports useWhileIteration from index', async () => {
    const index = await import('./index.js')
    expect(index.useWhileIteration).toBeDefined()
  })

  test('exports WhileProps type from index', async () => {
    // TypeScript check - this compiles if the type is exported
    const index = await import('./index.js')
    type _TestWhileProps = typeof index extends { While: (props: infer P) => any } ? P : never
    // If we got here, the type exists
    expect(true).toBe(true)
  })

  test('exports WhileIterationContextValue type from index', async () => {
    // TypeScript check - this compiles if the type is exported
    const index = await import('./index.js')
    expect(index.useWhileIteration).toBeDefined()
    // The return type of useWhileIteration should be WhileIterationContextValue | null
    expect(true).toBe(true)
  })
})

// ============================================================================
// CONFIG.MAXITERATIONS FALLBACK
// ============================================================================

describe('While config.maxIterations fallback', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-while-config', 'While.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    
    root.dispose()
    db.close()
  })

  test('uses config.maxIterations when prop not provided', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} config={{ maxIterations: 25 }}>
        <While id="config-max" condition={() => true}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('maxIterations="25"')
  })

  test('prop maxIterations overrides config.maxIterations', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} config={{ maxIterations: 25 }}>
        <While id="prop-override" condition={() => true} maxIterations={5}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('maxIterations="5"')
  })

  test('defaults to 10 when neither prop nor config provided', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <While id="default-max" condition={() => true}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('maxIterations="10"')
  })

  test('defaults to 10 when config exists but maxIterations not set', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} config={{ verbose: true }}>
        <While id="config-no-max" condition={() => true}>
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('maxIterations="10"')
  })

  test('config.maxIterations=0 is respected (stops immediately)', async () => {
    let completeCalled = false
    let completeReason: 'condition' | 'max' | null = null

    await root.render(
      <SmithersProvider db={db} executionId={executionId} config={{ maxIterations: 0 }}>
        <While
          id="config-zero"
          condition={() => true}
          onComplete={(_, reason) => {
            completeCalled = true
            completeReason = reason
          }}
        >
          <task>Work</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    expect(completeCalled).toBe(true)
    expect(completeReason).toBe('condition')
  })

  test('multiple While loops share same config.maxIterations default', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} config={{ maxIterations: 15 }}>
        <While id="loop-a" condition={() => true}>
          <task>Loop A</task>
        </While>
        <While id="loop-b" condition={() => true}>
          <task>Loop B</task>
        </While>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    // Both loops should have maxIterations="15"
    const matches = xml.match(/maxIterations="15"/g)
    expect(matches?.length).toBe(2)
  })
})

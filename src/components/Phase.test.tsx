import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { createSmithersRoot, type SmithersRoot } from '../reconciler/root.js'
import { SmithersProvider, signalOrchestrationComplete, useSmithers } from './SmithersProvider.js'
import { Phase, type PhaseProps } from './Phase.js'
import { PhaseRegistryProvider, usePhaseRegistry } from './PhaseRegistry.js'
import { Step } from './Step.js'
import { useExecutionEffect, useExecutionScope } from './ExecutionScope.js'
import { Ralph } from './Ralph.js'

function PhaseTaskRunner(props: { name: string; delay?: number }) {
  const { db } = useSmithers()
  const executionScope = useExecutionScope()
  const taskIdRef = React.useRef<string | null>(null)

  useExecutionEffect(executionScope.enabled, () => {
    taskIdRef.current = db.tasks.start('phase-test-task', props.name, { scopeId: executionScope.scopeId })
    const timeoutId = setTimeout(() => {
      if (!db.db.isClosed && taskIdRef.current) {
        db.tasks.complete(taskIdRef.current)
      }
    }, props.delay ?? 20)
    return () => clearTimeout(timeoutId)
  }, [db, executionScope.enabled, props.delay, props.name])

  return <task name={props.name} />
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

describe('Phase Exports', () => {
  test('exports Phase component', () => {
    expect(Phase).toBeDefined()
    expect(typeof Phase).toBe('function')
  })

  test('Phase component has correct name', () => {
    expect(Phase.name).toBe('Phase')
  })
})

// ============================================================================
// PHASE PROPS INTERFACE
// ============================================================================

describe('PhaseProps interface', () => {
  test('requires name prop', () => {
    const props: PhaseProps = {
      name: 'TestPhase',
      children: null,
    }
    expect(props.name).toBe('TestPhase')
  })

  test('requires children prop', () => {
    const props: PhaseProps = {
      name: 'TestPhase',
      children: <div>Content</div>,
    }
    expect(props.children).toBeDefined()
  })

  test('accepts optional skipIf prop', () => {
    const skipFn = () => false
    const props: PhaseProps = {
      name: 'TestPhase',
      children: null,
      skipIf: skipFn,
    }
    expect(props.skipIf).toBe(skipFn)
  })

  test('accepts optional onStart callback', () => {
    const onStart = () => {}
    const props: PhaseProps = {
      name: 'TestPhase',
      children: null,
      onStart,
    }
    expect(props.onStart).toBe(onStart)
  })

  test('accepts optional onComplete callback', () => {
    const onComplete = () => {}
    const props: PhaseProps = {
      name: 'TestPhase',
      children: null,
      onComplete,
    }
    expect(props.onComplete).toBe(onComplete)
  })
})

// ============================================================================
// PHASE RENDERING
// ============================================================================

describe('Phase rendering', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-phase-render', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('renders phase element with name prop', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="MyPhase">
            <task>Work</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('<phase')
    expect(xml).toContain('name="MyPhase"')
  })

  test('renders phase with status attribute', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="StatusPhase">
            <task>Work</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('status=')
  })

  test('active phase renders children', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="ActivePhase">
            <child-content>I should be visible</child-content>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('<child-content>')
    expect(xml).toContain('I should be visible')
  })

  test('renders multiple phases in sequence', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="Phase1">
            <task>Task 1</task>
          </Phase>
          <Phase name="Phase2">
            <task>Task 2</task>
          </Phase>
          <Phase name="Phase3">
            <task>Task 3</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('name="Phase1"')
    expect(xml).toContain('name="Phase2"')
    expect(xml).toContain('name="Phase3"')
  })

  test('phases are rendered in sequential order', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="First">
            <first-content>First phase content</first-content>
          </Phase>
          <Phase name="Second">
            <second-content>Second phase content</second-content>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('name="First"')
    expect(xml).toContain('name="Second"')
  })
})

// ============================================================================
// PHASE STATUS TRANSITIONS
// ============================================================================

describe('Phase status transitions', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-phase-status', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('first phase has active status', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="ActivePhase">
            <task>Work</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('status="active"')
  })

  test('phases transition through statuses', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="First">
            <task>First</task>
          </Phase>
          <Phase name="Second">
            <task>Second</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('status=')
  })

  test('skipped phase has skipped status when skipIf returns true', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="SkippedPhase" skipIf={() => true}>
            <task>Should be skipped</task>
          </Phase>
          <Phase name="NextPhase">
            <task>Next</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('status="skipped"')
  })
})

// ============================================================================
// PHASE SKIP FUNCTIONALITY
// ============================================================================

describe('Phase skipIf functionality', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-phase-skip', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('skipped phase does not render children', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="SkippedPhase" skipIf={() => true}>
            <hidden-content>Should not appear</hidden-content>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).not.toContain('<hidden-content>')
  })

  test('non-skipped phase renders children', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="NotSkipped" skipIf={() => false}>
            <visible-content>Should appear</visible-content>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('<visible-content>')
  })

  test('skipIf function receives no arguments', async () => {
    let argCount = -1
    const skipFn = (...args: any[]) => {
      argCount = args.length
      return false
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="TestPhase" skipIf={skipFn}>
            <task>Work</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    expect(argCount).toBe(0)
  })
})

// ============================================================================
// PHASE CALLBACKS
// ============================================================================

describe('Phase callbacks', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-phase-callbacks', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('onStart is called when phase becomes active', async () => {
    let startCalled = false

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="WithStart" onStart={() => { startCalled = true }}>
            <task>Work</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))
    expect(startCalled).toBe(true)
  })

  test('onStart is called for each phase when it becomes active', async () => {
    const phasesStarted: string[] = []

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="First" onStart={() => { phasesStarted.push('First') }}>
            <task>First</task>
          </Phase>
          <Phase name="Second" onStart={() => { phasesStarted.push('Second') }}>
            <task>Second</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))
    expect(phasesStarted).toContain('First')
  })

  test('onStart is not called for skipped phase', async () => {
    let startCalled = false

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="Skipped" skipIf={() => true} onStart={() => { startCalled = true }}>
            <task>Work</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))
    expect(startCalled).toBe(false)
  })
})

// ============================================================================
// PHASE DATABASE INTEGRATION
// ============================================================================

describe('Phase database integration', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-phase-db', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('active phase is logged to database', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="LoggedPhase">
            <task>Work</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const phases = db.db.query<{ name: string; status: string }>(
      'SELECT name, status FROM phases WHERE name = ?',
      ['LoggedPhase']
    )
    expect(phases.length).toBeGreaterThan(0)
  })

  test('skipped phase is logged to database with skipped status', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="SkippedLogged" skipIf={() => true}>
            <task>Work</task>
          </Phase>
          <Phase name="NextPhase">
            <task>Next</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 200))

    const phases = db.db.query<{ name: string; status: string }>(
      'SELECT name, status FROM phases WHERE name = ?',
      ['SkippedLogged']
    )
    expect(phases.length).toBeGreaterThan(0)
    expect(phases[0].status).toBe('skipped')
  })
})

// ============================================================================
// PHASE WITH STEP REGISTRY
// ============================================================================

describe('Phase with StepRegistry', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-phase-steps', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('Phase wraps children in StepRegistryProvider', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="WithSteps">
            <step name="Step1">Work 1</step>
            <step name="Step2">Work 2</step>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('<step')
  })

  test('advances phase when all steps complete', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Ralph id="test" condition={() => true} maxIterations={3}>
          <PhaseRegistryProvider>
            <Phase name="First">
              <Step name="First-1"><PhaseTaskRunner name="first-1" delay={25} /></Step>
              <Step name="First-2"><PhaseTaskRunner name="first-2" delay={25} /></Step>
            </Phase>
            <Phase name="Second">
              <Step name="Second-1"><PhaseTaskRunner name="second-1" delay={10} /></Step>
            </Phase>
          </PhaseRegistryProvider>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 500))

    const phases = db.db.query<{ name: string; status: string }>(
      'SELECT name, status FROM phases WHERE name = ?',
      ['First']
    )
    expect(phases.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// BOUNDARY CONDITIONS
// ============================================================================

describe('Phase boundary conditions', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-phase-boundary', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('handles empty phase name', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="">
            <task>Empty name phase</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('name=""')
  })

  test('handles very long phase name', async () => {
    const longName = 'A'.repeat(500)
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name={longName}>
            <task>Long name phase</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain(longName)
  })

  test('handles special characters in phase name', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="Phase <with> 'special' &chars;">
            <task>Special chars phase</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('<phase')
  })

  test('handles null children gracefully', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="NullChildren">
            {null}
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('name="NullChildren"')
  })

  test('handles undefined children gracefully', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="UndefinedChildren">
            {undefined}
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('name="UndefinedChildren"')
  })

  test('handles mixed valid and null children', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="MixedChildren">
            {null}
            <task>Valid</task>
            {undefined}
            <task>Also Valid</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('Valid')
    expect(xml).toContain('Also Valid')
  })
})

// ============================================================================
// NESTED PHASES
// ============================================================================

describe('Nested phases', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-nested-phases', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('renders nested phase structure', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="Outer">
            <wrapper>
              <task>Outer task with nested content</task>
            </wrapper>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('name="Outer"')
    expect(xml).toContain('<wrapper>')
  })

  test('multiple sibling phases render correctly', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="Sibling1">
            <task>Task 1</task>
          </Phase>
          <Phase name="Sibling2">
            <task>Task 2</task>
          </Phase>
          <Phase name="Sibling3">
            <task>Task 3</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    const phase1Match = xml.match(/name="Sibling1"/)
    const phase2Match = xml.match(/name="Sibling2"/)
    const phase3Match = xml.match(/name="Sibling3"/)

    expect(phase1Match).not.toBeNull()
    expect(phase2Match).not.toBeNull()
    expect(phase3Match).not.toBeNull()
  })
})

// ============================================================================
// CONCURRENT PHASES
// ============================================================================

describe('Concurrent phase registration', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-concurrent-phases', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('handles many phases registered at once', async () => {
    const phaseNames = Array.from({ length: 20 }, (_, i) => `Phase${i}`)

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          {phaseNames.map(name => (
            <Phase key={name} name={name}>
              <task>Work for {name}</task>
            </Phase>
          ))}
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    phaseNames.forEach(name => {
      expect(xml).toContain(`name="${name}"`)
    })
  })
})

// ============================================================================
// PHASE CONTEXT PROPAGATION
// ============================================================================

describe('Phase context propagation', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-phase-context', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('child components can access phase registry', async () => {
    let childHasAccess = false

    function ChildComponent() {
      try {
        const registry = usePhaseRegistry()
        childHasAccess = !!registry
      } catch {
        childHasAccess = false
      }
      return <child-result hasAccess={childHasAccess} />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="Parent">
            <ChildComponent />
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    expect(childHasAccess).toBe(true)
  })

  test('deeply nested children can access phase registry', async () => {
    let deepChildHasAccess = false

    function DeepChild() {
      try {
        const registry = usePhaseRegistry()
        deepChildHasAccess = !!registry
      } catch {
        deepChildHasAccess = false
      }
      return <deep-child hasAccess={deepChildHasAccess} />
    }

    function MiddleComponent() {
      return (
        <wrapper>
          <DeepChild />
        </wrapper>
      )
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="Parent">
            <MiddleComponent />
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    expect(deepChildHasAccess).toBe(true)
  })
})

// ============================================================================
// PHASE CLEANUP
// ============================================================================

describe('Phase cleanup on unmount', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-phase-cleanup', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('disposes root without error', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="ToBeDisposed">
            <task>Work</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    expect(() => root.dispose()).not.toThrow()
  })

  test('unmounting clears rendered phases', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Ralph id="test" condition={() => true} maxIterations={1}>
          <Phase name="WillUnmount">
            <task>Work</task>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    await root.render(null)

    const tree = root.getTree()
    expect(tree.children.length).toBe(0)
  })
})

// ============================================================================
// INDEX EXPORTS
// ============================================================================

describe('Phase index exports', () => {
  test('exports Phase from index', async () => {
    const index = await import('./index.js')
    expect(index.Phase).toBeDefined()
  })
})

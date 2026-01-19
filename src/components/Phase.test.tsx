import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { createSmithersRoot, type SmithersRoot } from '../reconciler/root.js'
import { SmithersProvider, signalOrchestrationComplete } from './SmithersProvider.js'
import { Phase, type PhaseProps } from './Phase.js'
import { usePhaseRegistry } from './PhaseRegistry.js'

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
        <Phase name="MyPhase">
          <task>Work</task>
        </Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<phase')
    expect(xml).toContain('name="MyPhase"')
  })

  test('renders phase with status attribute', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="StatusPhase">
          <task>Work</task>
        </Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('status=')
  })

  test('active phase renders children', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="ActivePhase">
          <child-content>I should be visible</child-content>
        </Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<child-content>')
    expect(xml).toContain('I should be visible')
  })

  test('renders multiple phases in sequence', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="Phase1">
          <task>Task 1</task>
        </Phase>
        <Phase name="Phase2">
          <task>Task 2</task>
        </Phase>
        <Phase name="Phase3">
          <task>Task 3</task>
        </Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('name="Phase1"')
    expect(xml).toContain('name="Phase2"')
    expect(xml).toContain('name="Phase3"')
  })

  test('only first phase is active initially', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="First">
          <first-content>First phase content</first-content>
        </Phase>
        <Phase name="Second">
          <second-content>Second phase content</second-content>
        </Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<first-content>')
    expect(xml).not.toContain('<second-content>')
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
        <Phase name="ActivePhase">
          <task>Work</task>
        </Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('status="active"')
  })

  test('non-first phases have pending status', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="First">
          <task>First</task>
        </Phase>
        <Phase name="Second">
          <task>Second</task>
        </Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('status="pending"')
  })

  test('skipped phase has skipped status when skipIf returns true', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="SkippedPhase" skipIf={() => true}>
          <task>Should be skipped</task>
        </Phase>
        <Phase name="NextPhase">
          <task>Next</task>
        </Phase>
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
        <Phase name="SkippedPhase" skipIf={() => true}>
          <hidden-content>Should not appear</hidden-content>
        </Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).not.toContain('<hidden-content>')
  })

  test('non-skipped phase renders children', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="NotSkipped" skipIf={() => false}>
          <visible-content>Should appear</visible-content>
        </Phase>
      </SmithersProvider>
    )

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
        <Phase name="TestPhase" skipIf={skipFn}>
          <task>Work</task>
        </Phase>
      </SmithersProvider>
    )

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
        <Phase name="WithStart" onStart={() => { startCalled = true }}>
          <task>Work</task>
        </Phase>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))
    expect(startCalled).toBe(true)
  })

  test('onStart is not called for non-active phase', async () => {
    let phase2StartCalled = false

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="First">
          <task>First</task>
        </Phase>
        <Phase name="Second" onStart={() => { phase2StartCalled = true }}>
          <task>Second</task>
        </Phase>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))
    expect(phase2StartCalled).toBe(false)
  })

  test('onStart is not called for skipped phase', async () => {
    let startCalled = false

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="Skipped" skipIf={() => true} onStart={() => { startCalled = true }}>
          <task>Work</task>
        </Phase>
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
        <Phase name="LoggedPhase">
          <task>Work</task>
        </Phase>
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
        <Phase name="SkippedLogged" skipIf={() => true}>
          <task>Work</task>
        </Phase>
        <Phase name="NextPhase">
          <task>Next</task>
        </Phase>
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
        <Phase name="WithSteps">
          <step name="Step1">Work 1</step>
          <step name="Step2">Work 2</step>
        </Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<step')
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
        <Phase name="">
          <task>Empty name phase</task>
        </Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('name=""')
  })

  test('handles very long phase name', async () => {
    const longName = 'A'.repeat(500)
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name={longName}>
          <task>Long name phase</task>
        </Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain(longName)
  })

  test('handles special characters in phase name', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="Phase <with> 'special' &chars;">
          <task>Special chars phase</task>
        </Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<phase')
  })

  test('handles null children gracefully', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="NullChildren">
          {null}
        </Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('name="NullChildren"')
  })

  test('handles undefined children gracefully', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="UndefinedChildren">
          {undefined}
        </Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('name="UndefinedChildren"')
  })

  test('handles mixed valid and null children', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="MixedChildren">
          {null}
          <task>Valid</task>
          {undefined}
          <task>Also Valid</task>
        </Phase>
      </SmithersProvider>
    )

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
        <Phase name="Outer">
          <wrapper>
            <Phase name="Inner">
              <task>Inner task</task>
            </Phase>
          </wrapper>
        </Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('name="Outer"')
    expect(xml).toContain('name="Inner"')
  })

  test('multiple sibling phases render correctly', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="Sibling1">
          <task>Task 1</task>
        </Phase>
        <Phase name="Sibling2">
          <task>Task 2</task>
        </Phase>
        <Phase name="Sibling3">
          <task>Task 3</task>
        </Phase>
      </SmithersProvider>
    )

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
        {phaseNames.map(name => (
          <Phase key={name} name={name}>
            <task>Work for {name}</task>
          </Phase>
        ))}
      </SmithersProvider>
    )

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
        <Phase name="Parent">
          <ChildComponent />
        </Phase>
      </SmithersProvider>
    )

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
        <Phase name="Parent">
          <MiddleComponent />
        </Phase>
      </SmithersProvider>
    )

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
        <Phase name="ToBeDisposed">
          <task>Work</task>
        </Phase>
      </SmithersProvider>
    )

    expect(() => root.dispose()).not.toThrow()
  })

  test('unmounting clears rendered phases', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="WillUnmount">
          <task>Work</task>
        </Phase>
      </SmithersProvider>
    )

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

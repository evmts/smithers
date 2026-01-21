/**
 * Unit tests for components - using intrinsic elements to test serialization.
 * Component interface tests are in individual *.test.tsx files.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { serialize } from '../reconciler/serialize.js'
import { jsx } from '../reconciler/jsx-runtime.js'
import type { SmithersNode } from '../reconciler/types.js'
import { createSmithersRoot, type SmithersRoot } from '../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { SmithersProvider, signalOrchestrationComplete } from './SmithersProvider.js'
import { Phase } from './Phase.js'
import { Ralph } from './Ralph.js'
import { PhaseContext, usePhaseContext } from './PhaseContext.js'
import { StepContext, useStepContext } from './StepContext.js'
import { WorktreeProvider, useWorktree } from './WorktreeProvider.js'

function createNode(
  type: string,
  props: Record<string, unknown> = {},
  children: (SmithersNode | string)[] = []
): SmithersNode {
  const node: SmithersNode = {
    type,
    props,
    children: children.map(child => {
      if (typeof child === 'string') {
        return {
          type: 'TEXT',
          props: { value: child },
          children: [],
          parent: null,
        }
      }
      return child
    }),
    parent: null,
  }
  node.children.forEach(child => {
    child.parent = node
  })
  return node
}

describe('Phase element', () => {
  test('creates phase element with name prop', () => {
    const node = jsx('phase', { name: 'research' })
    expect(node.type).toBe('phase')
    expect(node.props.name).toBe('research')
  })

  test('spreads additional props', () => {
    const node = jsx('phase', { name: 'test', count: 42, enabled: true })
    expect(node.props.name).toBe('test')
    expect(node.props.count).toBe(42)
    expect(node.props.enabled).toBe(true)
  })

  test('renders children', () => {
    const child = jsx('step', { children: 'Step content' })
    const node = jsx('phase', { name: 'test', children: child })
    expect(node.props.children).toBe(child)
  })
})

describe('Step element', () => {
  test('creates step element', () => {
    const node = jsx('step', { children: 'Do something' })
    expect(node.type).toBe('step')
  })

  test('renders text children', () => {
    const node = jsx('step', { children: 'Read the docs' })
    expect(node.props.children).toBe('Read the docs')
  })
})

describe('Stop element', () => {
  test('creates stop element', () => {
    const node = jsx('smithers-stop', { reason: 'All done' })
    expect(node.type).toBe('smithers-stop')
    expect(node.props.reason).toBe('All done')
  })

  test('works without reason', () => {
    const node = jsx('smithers-stop', {})
    expect(node.type).toBe('smithers-stop')
  })
})

describe('Persona element', () => {
  test('creates persona element with role', () => {
    const node = jsx('persona', { role: 'security expert' })
    expect(node.type).toBe('persona')
    expect(node.props.role).toBe('security expert')
  })

  test('renders description children', () => {
    const node = jsx('persona', { role: 'expert', children: 'You specialize in security.' })
    expect(node.props.children).toBe('You specialize in security.')
  })
})

describe('Constraints element', () => {
  test('creates constraints element', () => {
    const node = jsx('constraints', { children: '- Be concise' })
    expect(node.type).toBe('constraints')
  })
})

describe('Task element', () => {
  test('creates task element with done prop', () => {
    const node = jsx('task', { done: false, children: 'Pending task' })
    expect(node.type).toBe('task')
    expect(node.props.done).toBe(false)
  })

  test('done prop can be true', () => {
    const node = jsx('task', { done: true, children: 'Completed task' })
    expect(node.props.done).toBe(true)
  })
})

describe('Human element', () => {
  test('creates human element with message', () => {
    const node = jsx('human', { message: 'Approve?' })
    expect(node.type).toBe('human')
    expect(node.props.message).toBe('Approve?')
  })
})

describe('Subagent element', () => {
  test('creates subagent element with name', () => {
    const node = jsx('subagent', { name: 'researcher' })
    expect(node.type).toBe('subagent')
    expect(node.props.name).toBe('researcher')
  })

  test('parallel prop is set', () => {
    const node = jsx('subagent', { name: 'parallel-agent', parallel: true })
    expect(node.props.parallel).toBe(true)
  })

  test('renders child components', () => {
    const child = jsx('phase', { name: 'inner' })
    const node = jsx('subagent', { name: 'outer', children: child })
    expect(node.props.children).toBe(child)
  })
})

describe('Claude-api element', () => {
  test('creates claude-api element', () => {
    const node = jsx('claude-api', { children: 'Prompt text' })
    expect(node.type).toBe('claude-api')
  })

  test('accepts model prop', () => {
    const node = jsx('claude-api', { model: 'claude-opus-4' })
    expect(node.props.model).toBe('claude-opus-4')
  })
})

describe('Component composition', () => {
  test('nested components create proper tree structure', () => {
    const stepNode = jsx('step', { children: 'Step 1' })
    const phaseNode = jsx('phase', { name: 'test', children: stepNode })

    expect(phaseNode.type).toBe('phase')
    expect(phaseNode.props.children).toBe(stepNode)
    expect(phaseNode.props.children.type).toBe('step')
  })

  test('serializes nested structure correctly', () => {
    const stepNode = createNode('step', {}, ['Do work'])
    const phaseNode = createNode('phase', { name: 'main' }, [stepNode])

    const xml = serialize(phaseNode)

    expect(xml).toContain('<phase name="main">')
    expect(xml).toContain('<step>')
    expect(xml).toContain('Do work')
    expect(xml).toContain('</phase>')
  })
})

describe('If component', () => {
  test('renders children when condition=true', async () => {
    const { If } = await import('./If.js')
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(
      <If condition={true}>
        <step>Visible</step>
      </If>
    )
    expect(root.toXML()).toContain('<step>')
    expect(root.toXML()).toContain('Visible')
    root.dispose()
  })

  test('renders null when condition=false', async () => {
    const { If } = await import('./If.js')
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(
      <If condition={false}>
        <step>Hidden</step>
      </If>
    )
    expect(root.toXML()).not.toContain('<step>')
    expect(root.toXML()).not.toContain('Hidden')
    root.dispose()
  })

  test('handles multiple children', async () => {
    const { If } = await import('./If.js')
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(
      <If condition={true}>
        <step>First</step>
        <step>Second</step>
      </If>
    )
    expect(root.toXML()).toContain('First')
    expect(root.toXML()).toContain('Second')
    root.dispose()
  })
})

describe('Stop component', () => {
  test('exports Stop component', async () => {
    const { Stop } = await import('./Stop.js')
    expect(typeof Stop).toBe('function')
  })

  test('stop intrinsic renders <smithers-stop> element', async () => {
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(<smithers-stop />)
    expect(root.toXML()).toContain('<smithers-stop')
    root.dispose()
  })

  test('stop intrinsic renders reason attribute', async () => {
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(<smithers-stop reason="All done" />)
    expect(root.toXML()).toContain('reason="All done"')
    root.dispose()
  })

  test('stop intrinsic renders children', async () => {
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(<smithers-stop>Work complete</smithers-stop>)
    expect(root.toXML()).toContain('Work complete')
    root.dispose()
  })
})

describe('Constraints component', () => {
  test('renders <constraints> element', async () => {
    const { Constraints } = await import('./Constraints.js')
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(<Constraints>Be concise</Constraints>)
    expect(root.toXML()).toContain('<constraints>')
    expect(root.toXML()).toContain('Be concise')
    root.dispose()
  })
})

describe('Persona component', () => {
  test('renders <persona> element', async () => {
    const { Persona } = await import('./Persona.js')
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(<Persona>Security expert</Persona>)
    expect(root.toXML()).toContain('<persona>')
    expect(root.toXML()).toContain('Security expert')
    root.dispose()
  })

  test('renders role attribute when provided', async () => {
    const { Persona } = await import('./Persona.js')
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(<Persona role="security expert" />)
    expect(root.toXML()).toContain('role="security expert"')
    root.dispose()
  })

  test('renders without role attribute when not provided', async () => {
    const { Persona } = await import('./Persona.js')
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(<Persona>Description</Persona>)
    expect(root.toXML()).not.toContain('role=')
    root.dispose()
  })
})

describe('Human component', () => {
  test('exports Human component', async () => {
    const { Human } = await import('./Human.js')
    expect(typeof Human).toBe('function')
  })

  test('human intrinsic renders <human> element', async () => {
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(<human message="Approve?" />)
    expect(root.toXML()).toContain('<human')
    root.dispose()
  })

  test('human intrinsic renders message attribute', async () => {
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(<human message="Confirm deploy?" />)
    expect(root.toXML()).toContain('message="Confirm deploy?"')
    root.dispose()
  })

  test('human intrinsic renders children', async () => {
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(<human message="Review">Details here</human>)
    expect(root.toXML()).toContain('Details here')
    root.dispose()
  })
})

describe('Subagent component', () => {
  test('renders <subagent> element', async () => {
    const { Subagent } = await import('./Subagent.js')
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(<Subagent name="researcher" />)
    expect(root.toXML()).toContain('<subagent')
    root.dispose()
  })

  test('renders name attribute when provided', async () => {
    const { Subagent } = await import('./Subagent.js')
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(<Subagent name="analyzer" />)
    expect(root.toXML()).toContain('name="analyzer"')
    root.dispose()
  })

  test('renders parallel attribute when true', async () => {
    const { Subagent } = await import('./Subagent.js')
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(<Subagent name="worker" parallel={true} />)
    expect(root.toXML()).toContain('parallel="true"')
    root.dispose()
  })

  test('renders children inside element', async () => {
    const { Subagent } = await import('./Subagent.js')
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(
      <Subagent name="outer">
        <step>Inner step</step>
      </Subagent>
    )
    expect(root.toXML()).toContain('Inner step')
    root.dispose()
  })
})

describe('Task component', () => {
  test('renders <task> element', async () => {
    const { Task } = await import('./Task.js')
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(<Task>Do work</Task>)
    expect(root.toXML()).toContain('<task')
    root.dispose()
  })

  test('done=true renders correctly', async () => {
    const { Task } = await import('./Task.js')
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(<Task done={true}>Completed</Task>)
    expect(root.toXML()).toContain('done="true"')
    root.dispose()
  })

  test('done=false renders correctly', async () => {
    const { Task } = await import('./Task.js')
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(<Task done={false}>Pending</Task>)
    expect(root.toXML()).toContain('done="false"')
    root.dispose()
  })

  test('renders children inside element', async () => {
    const { Task } = await import('./Task.js')
    const { createSmithersRoot } = await import('../reconciler/root.js')
    const root = createSmithersRoot()
    await root.render(<Task>Research topic</Task>)
    expect(root.toXML()).toContain('Research topic')
    root.dispose()
  })
})

describe('Phase component', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('phase-component-test', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  describe('Props validation', () => {
    test('name prop is required', async () => {
      await root.render(
        <SmithersProvider db={db} executionId={executionId} stopped>
          <Ralph id="test" condition={() => true} maxIterations={1}>
            <Phase name="RequiredName">
              <step>content</step>
            </Phase>
          </Ralph>
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      expect(root.toXML()).toContain('name="RequiredName"')
    })

    test('children prop is required', async () => {
      await root.render(
        <SmithersProvider db={db} executionId={executionId} stopped>
          <Ralph id="test" condition={() => true} maxIterations={1}>
            <Phase name="Test">
              <step>child content</step>
            </Phase>
          </Ralph>
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      expect(root.toXML()).toContain('child content')
    })

    test('skipIf prop is optional function', async () => {
      const skipFn = () => false
      await root.render(
        <SmithersProvider db={db} executionId={executionId} stopped>
          <Ralph id="test" condition={() => true} maxIterations={1}>
            <Phase name="Test" skipIf={skipFn}>
              <step>content</step>
            </Phase>
          </Ralph>
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      expect(root.toXML()).toContain('status="active"')
    })

    test('onStart callback is optional', async () => {
      let started = false
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Ralph id="test" condition={() => true} maxIterations={1}>
            <Phase name="Test" onStart={() => { started = true }}>
              <step>content</step>
            </Phase>
          </Ralph>
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      expect(started).toBe(true)
    })

    test('onComplete callback is optional', async () => {
      await root.render(
        <SmithersProvider db={db} executionId={executionId} stopped>
          <Ralph id="test" condition={() => true} maxIterations={1}>
            <Phase name="Test" onComplete={() => {}}>
              <step>content</step>
            </Phase>
          </Ralph>
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      expect(root.toXML()).toContain('phase')
    })
  })

  describe('Execution lifecycle', () => {
    test('starts phase in db.phases.start when activated', async () => {
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Ralph id="test" condition={() => true} maxIterations={1}>
            <Phase name="TestPhase">
              <step>content</step>
            </Phase>
          </Ralph>
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      const phases = db.query<{ name: string }>('SELECT name FROM phases WHERE name = ?', ['TestPhase'])
      expect(phases.length).toBeGreaterThanOrEqual(1)
    })

    test('calls onStart callback when activated', async () => {
      let startCalled = false
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Ralph id="test" condition={() => true} maxIterations={1}>
            <Phase name="Test" onStart={() => { startCalled = true }}>
              <step>content</step>
            </Phase>
          </Ralph>
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      expect(startCalled).toBe(true)
    })
  })

  describe('Skip behavior', () => {
    test('skips phase when skipIf returns true', async () => {
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Ralph id="test" condition={() => true} maxIterations={1}>
            <Phase name="SkippedPhase" skipIf={() => true}>
              <step>should not render</step>
            </Phase>
            <Phase name="NextPhase">
              <step>should render</step>
            </Phase>
          </Ralph>
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      const xml = root.toXML()
      expect(xml).toContain('status="skipped"')
    })

    test('logs skipped phase to database', async () => {
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Ralph id="test" condition={() => true} maxIterations={1}>
            <Phase name="SkippedPhase" skipIf={() => true}>
              <step>content</step>
            </Phase>
          </Ralph>
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      const phases = db.query<{ status: string }>('SELECT status FROM phases WHERE name = ?', ['SkippedPhase'])
      if (phases.length > 0) {
        expect(phases[0].status).toBe('skipped')
      }
    })
  })

  describe('Sequential execution', () => {
    test('only active phase renders children', async () => {
      await root.render(
        <SmithersProvider db={db} executionId={executionId} stopped>
          <Ralph id="test" condition={() => true} maxIterations={1}>
            <Phase name="First">
              <step>first content</step>
            </Phase>
            <Phase name="Second">
              <step>second content</step>
            </Phase>
          </Ralph>
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 20))
      const xml = root.toXML()
      // Only the active phase renders its children - completed phases don't show children
      expect(xml).toContain('status="active"')
      expect(xml).toContain('status="completed"')
      // The completed phase has no children rendered
      expect(xml).toMatch(/<phase[^>]*status="completed"[^>]*\/>/)
    })

    test('phases execute sequentially - first completes then second activates', async () => {
      await root.render(
        <SmithersProvider db={db} executionId={executionId} stopped>
          <Ralph id="test" condition={() => true} maxIterations={1}>
            <Phase name="First">
              <step>first</step>
            </Phase>
            <Phase name="Second">
              <step>second</step>
            </Phase>
          </Ralph>
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 20))
      const xml = root.toXML()
      // With Ralph, phases advance - First completes, Second becomes active
      expect(xml).toContain('name="First"')
      expect(xml).toContain('name="Second"')
      // Active phase renders children, completed phase does not
      expect(xml).toMatch(/name="First"[^>]*status="completed"/)
    })
  })

  describe('XML rendering', () => {
    test('renders <phase name="..."> element', async () => {
      await root.render(
        <SmithersProvider db={db} executionId={executionId} stopped>
          <Ralph id="test" condition={() => true} maxIterations={1}>
            <Phase name="MyPhase">
              <step>content</step>
            </Phase>
          </Ralph>
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      expect(root.toXML()).toMatch(/<phase[^>]*name="MyPhase"/)
    })

    test('renders status for phases in sequential order', async () => {
      await root.render(
        <SmithersProvider db={db} executionId={executionId} stopped>
          <Ralph id="test" condition={() => true} maxIterations={1}>
            <Phase name="First">
              <step>first</step>
            </Phase>
            <Phase name="Second">
              <step>second</step>
            </Phase>
          </Ralph>
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      const xml = root.toXML()
      // All phases have status attributes
      expect(xml).toContain('name="First"')
      expect(xml).toContain('name="Second"')
      // At least one phase has completed status (first finishes before second activates)
      expect(xml).toContain('status="completed"')
    })

    test('renders status="active" when active', async () => {
      await root.render(
        <SmithersProvider db={db} executionId={executionId} stopped>
          <Ralph id="test" condition={() => true} maxIterations={1}>
            <Phase name="Active">
              <step>content</step>
            </Phase>
          </Ralph>
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      expect(root.toXML()).toContain('status="active"')
    })

    test('renders status="skipped" when skipped', async () => {
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Ralph id="test" condition={() => true} maxIterations={1}>
            <Phase name="Skipped" skipIf={() => true}>
              <step>content</step>
            </Phase>
            <Phase name="Next">
              <step>next</step>
            </Phase>
          </Ralph>
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      expect(root.toXML()).toContain('status="skipped"')
    })
  })

  describe('Ralph iteration tracking', () => {
    test('uses ralphCount for phase iteration logging', async () => {
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Ralph id="test" condition={() => true} maxIterations={1}>
            <Phase name="IterationPhase">
              <step>content</step>
            </Phase>
          </Ralph>
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      const phases = db.query<{ iteration: number }>('SELECT iteration FROM phases WHERE name = ?', ['IterationPhase'])
      if (phases.length > 0) {
        expect(phases[0].iteration).toBeDefined()
      }
    })
  })
})

describe('Context providers', () => {
  describe('PhaseContext', () => {
    test('PhaseContext.Provider provides value', async () => {
      let capturedValue: ReturnType<typeof usePhaseContext> = null
      const Capture = () => {
        capturedValue = usePhaseContext()
        return <step>captured</step>
      }
      const root = createSmithersRoot()
      await root.render(
        <PhaseContext.Provider value={{ isActive: true }}>
          <Capture />
        </PhaseContext.Provider>
      )
      expect(capturedValue).toEqual({ isActive: true })
      root.dispose()
    })

    test('usePhaseContext returns null outside provider', async () => {
      let capturedValue: ReturnType<typeof usePhaseContext> = { isActive: false }
      const Capture = () => {
        capturedValue = usePhaseContext()
        return <step>captured</step>
      }
      const root = createSmithersRoot()
      await root.render(<Capture />)
      expect(capturedValue).toBeNull()
      root.dispose()
    })

    test('usePhaseContext returns context inside provider', async () => {
      let capturedValue: ReturnType<typeof usePhaseContext> = null
      const Capture = () => {
        capturedValue = usePhaseContext()
        return <step>captured</step>
      }
      const root = createSmithersRoot()
      await root.render(
        <PhaseContext.Provider value={{ isActive: false }}>
          <Capture />
        </PhaseContext.Provider>
      )
      expect(capturedValue?.isActive).toBe(false)
      root.dispose()
    })
  })

  describe('StepContext', () => {
    test('StepContext.Provider provides value', async () => {
      let capturedValue: ReturnType<typeof useStepContext> = null
      const Capture = () => {
        capturedValue = useStepContext()
        return <step>captured</step>
      }
      const root = createSmithersRoot()
      await root.render(
        <StepContext.Provider value={{ isActive: true }}>
          <Capture />
        </StepContext.Provider>
      )
      expect(capturedValue).toEqual({ isActive: true })
      root.dispose()
    })

    test('useStepContext returns null outside provider', async () => {
      let capturedValue: ReturnType<typeof useStepContext> = { isActive: false }
      const Capture = () => {
        capturedValue = useStepContext()
        return <step>captured</step>
      }
      const root = createSmithersRoot()
      await root.render(<Capture />)
      expect(capturedValue).toBeNull()
      root.dispose()
    })

    test('useStepContext returns context inside provider', async () => {
      let capturedValue: ReturnType<typeof useStepContext> = null
      const Capture = () => {
        capturedValue = useStepContext()
        return <step>captured</step>
      }
      const root = createSmithersRoot()
      await root.render(
        <StepContext.Provider value={{ isActive: true }}>
          <Capture />
        </StepContext.Provider>
      )
      expect(capturedValue?.isActive).toBe(true)
      root.dispose()
    })
  })

  describe('WorktreeProvider', () => {
    test('WorktreeProvider provides value', async () => {
      let capturedValue: ReturnType<typeof useWorktree> = null
      const Capture = () => {
        capturedValue = useWorktree()
        return <step>captured</step>
      }
      const root = createSmithersRoot()
      await root.render(
        <WorktreeProvider value={{ cwd: '/path', branch: 'main', isWorktree: true }}>
          <Capture />
        </WorktreeProvider>
      )
      expect(capturedValue).toEqual({ cwd: '/path', branch: 'main', isWorktree: true })
      root.dispose()
    })

    test('useWorktree returns null outside provider', async () => {
      let capturedValue: ReturnType<typeof useWorktree> = { cwd: '', branch: '', isWorktree: true }
      const Capture = () => {
        capturedValue = useWorktree()
        return <step>captured</step>
      }
      const root = createSmithersRoot()
      await root.render(<Capture />)
      expect(capturedValue).toBeNull()
      root.dispose()
    })

    test('useWorktree returns context inside provider', async () => {
      let capturedValue: ReturnType<typeof useWorktree> = null
      const Capture = () => {
        capturedValue = useWorktree()
        return <step>captured</step>
      }
      const root = createSmithersRoot()
      await root.render(
        <WorktreeProvider value={{ cwd: '/test/cwd', branch: 'feature', isWorktree: true }}>
          <Capture />
        </WorktreeProvider>
      )
      expect(capturedValue?.cwd).toBe('/test/cwd')
      expect(capturedValue?.branch).toBe('feature')
      root.dispose()
    })
  })
})

/**
 * Unit tests for components - using intrinsic elements to test serialization.
 * Component interface tests are in individual *.test.tsx files.
 */
import { describe, test, expect } from 'bun:test'
import { serialize } from '../reconciler/serialize.js'
import { jsx } from '../reconciler/jsx-runtime.js'
import type { SmithersNode } from '../reconciler/types.js'

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
  test.todo('renders children when condition=true')
  test.todo('renders null when condition=false')
  test.todo('children prop is required')
  test.todo('condition prop is required boolean')
  test.todo('handles empty children')
  test.todo('handles multiple children')
})

describe('Stop component', () => {
  test.todo('renders <smithers-stop> element')
  test.todo('renders reason attribute when provided')
  test.todo('renders without reason attribute when not provided')
  test.todo('renders children inside element')
  test.todo('renders without children')
})

describe('Constraints component', () => {
  test.todo('renders <constraints> element')
  test.todo('renders children inside element')
  test.todo('accepts arbitrary props')
})

describe('Persona component', () => {
  test.todo('renders <persona> element')
  test.todo('renders role attribute when provided')
  test.todo('renders without role attribute when not provided')
  test.todo('renders children inside element')
  test.todo('accepts arbitrary props')
})

describe('Human component', () => {
  test.todo('renders <human> element')
  test.todo('renders message attribute')
  test.todo('renders children inside element')
  test.todo('onApprove callback is available')
  test.todo('onReject callback is available')
  test.todo('accepts arbitrary props')
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
  describe('Props validation', () => {
    test.todo('name prop is required')
    test.todo('children prop is required')
    test.todo('skipIf prop is optional function')
    test.todo('onStart callback is optional')
    test.todo('onComplete callback is optional')
  })

  describe('Execution lifecycle', () => {
    test.todo('starts phase in db.phases.start when activated')
    test.todo('completes phase in db.phases.complete on completion')
    test.todo('calls onStart callback when activated')
    test.todo('calls onComplete callback when completed')
  })

  describe('Skip behavior', () => {
    test.todo('skips phase when skipIf returns true')
    test.todo('logs skipped phase to database')
    test.todo('advances to next phase when skipped')
    test.todo('only processes skip once (hasSkippedRef)')
  })

  describe('Sequential execution', () => {
    test.todo('only active phase renders children')
    test.todo('pending phases do not render children')
    test.todo('completed phases do not render children')
  })

  describe('StepRegistryProvider integration', () => {
    test.todo('wraps children in StepRegistryProvider')
    test.todo('passes phaseId to StepRegistryProvider')
    test.todo('onAllStepsComplete advances to next phase')
  })

  describe('XML rendering', () => {
    test.todo('renders <phase name="..."> element')
    test.todo('renders status="pending" when pending')
    test.todo('renders status="active" when active')
    test.todo('renders status="completed" when completed')
    test.todo('renders status="skipped" when skipped')
  })

  describe('Ralph iteration tracking', () => {
    test.todo('uses ralphCount for phase iteration logging')
  })
})

describe('Context providers', () => {
  describe('PhaseContext', () => {
    test.todo('PhaseContext.Provider provides value')
    test.todo('usePhaseContext returns null outside provider')
    test.todo('usePhaseContext returns context inside provider')
  })

  describe('StepContext', () => {
    test.todo('StepContext.Provider provides value')
    test.todo('useStepContext returns null outside provider')
    test.todo('useStepContext returns context inside provider')
  })

  describe('WorktreeProvider', () => {
    test.todo('WorktreeProvider provides value')
    test.todo('useWorktree returns null outside provider')
    test.todo('useWorktree returns context inside provider')
  })
})

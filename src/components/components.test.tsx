/**
 * Unit tests for components - using intrinsic elements to test serialization.
 * Component interface tests are in individual *.test.tsx files.
 */
import { describe, test, expect } from 'bun:test'
import { serialize } from '../reconciler/serialize.js'
import { jsx } from '../reconciler/jsx-runtime.js'

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
    expect(node.children).toHaveLength(1)
  })
})

describe('Step element', () => {
  test('creates step element', () => {
    const node = jsx('step', { children: 'Do something' })
    expect(node.type).toBe('step')
  })

  test('renders text children', () => {
    const node = jsx('step', { children: 'Read the docs' })
    expect(node.children).toHaveLength(1)
    expect(node.children[0].type).toBe('TEXT')
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
    expect(node.children).toHaveLength(1)
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
    expect(node.children).toHaveLength(1)
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
    expect(phaseNode.children).toHaveLength(1)
    expect(phaseNode.children[0].type).toBe('step')
  })

  test('serializes nested structure correctly', () => {
    const stepNode = jsx('step', { children: 'Do work' })
    const phaseNode = jsx('phase', { name: 'main', children: stepNode })

    const xml = serialize(phaseNode)

    expect(xml).toContain('<phase name="main">')
    expect(xml).toContain('<step>')
    expect(xml).toContain('Do work')
    expect(xml).toContain('</phase>')
  })
})

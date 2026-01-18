/**
 * Unit tests for components - Claude, Phase, Step, Ralph, etc.
 */
import { describe, test, expect } from 'bun:test'
import { serialize } from '../core/serialize'
import { jsx } from '../jsx-runtime'
import { Claude } from './Claude'
import { Phase } from './Phase'
import { Step } from './Step'
import { Stop } from './Stop'
import { Persona } from './Persona'
import { Constraints } from './Constraints'
import { Task } from './Task'
import { Human } from './Human'
import { Subagent } from './Subagent'
import { ClaudeApi } from './ClaudeApi'

describe('Phase component', () => {
  test('creates phase element with name prop', () => {
    const node = jsx(Phase, { name: 'research' })
    expect(node.type).toBe('phase')
    expect(node.props.name).toBe('research')
  })

  test('spreads additional props', () => {
    const node = jsx(Phase, { name: 'test', count: 42, enabled: true })
    expect(node.props.name).toBe('test')
    expect(node.props.count).toBe(42)
    expect(node.props.enabled).toBe(true)
  })

  test('renders children', () => {
    const child = jsx('step', { children: 'Step content' })
    const node = jsx(Phase, { name: 'test', children: child })
    expect(node.children).toHaveLength(1)
  })
})

describe('Step component', () => {
  test('creates step element', () => {
    const node = jsx(Step, { children: 'Do something' })
    expect(node.type).toBe('step')
  })

  test('renders text children', () => {
    const node = jsx(Step, { children: 'Read the docs' })
    expect(node.children).toHaveLength(1)
    expect(node.children[0].type).toBe('TEXT')
  })
})

describe('Stop component', () => {
  test('creates smithers-stop element', () => {
    const node = jsx(Stop, { reason: 'All done' })
    expect(node.type).toBe('smithers-stop')
    expect(node.props.reason).toBe('All done')
  })

  test('works without reason', () => {
    const node = jsx(Stop, {})
    expect(node.type).toBe('smithers-stop')
  })
})

describe('Persona component', () => {
  test('creates persona element with role', () => {
    const node = jsx(Persona, { role: 'security expert' })
    expect(node.type).toBe('persona')
    expect(node.props.role).toBe('security expert')
  })

  test('renders description children', () => {
    const node = jsx(Persona, { role: 'expert', children: 'You specialize in security.' })
    expect(node.children).toHaveLength(1)
  })
})

describe('Constraints component', () => {
  test('creates constraints element', () => {
    const node = jsx(Constraints, { children: '- Be concise' })
    expect(node.type).toBe('constraints')
  })
})

describe('Task component', () => {
  test('creates task element with done prop', () => {
    const node = jsx(Task, { done: false, children: 'Pending task' })
    expect(node.type).toBe('task')
    expect(node.props.done).toBe(false)
  })

  test('done prop can be true', () => {
    const node = jsx(Task, { done: true, children: 'Completed task' })
    expect(node.props.done).toBe(true)
  })
})

describe('Human component', () => {
  test('creates human element with message', () => {
    const node = jsx(Human, { message: 'Approve?' })
    expect(node.type).toBe('human')
    expect(node.props.message).toBe('Approve?')
  })
})

describe('Subagent component', () => {
  test('creates subagent element with name', () => {
    const node = jsx(Subagent, { name: 'researcher' })
    expect(node.type).toBe('subagent')
    expect(node.props.name).toBe('researcher')
  })

  test('parallel prop is set', () => {
    const node = jsx(Subagent, { name: 'parallel-agent', parallel: true })
    expect(node.props.parallel).toBe(true)
  })

  test('renders child components', () => {
    const child = jsx(Phase, { name: 'inner' })
    const node = jsx(Subagent, { name: 'outer', children: child })
    expect(node.children).toHaveLength(1)
  })
})

describe('ClaudeApi component', () => {
  test('creates claude-api element', () => {
    const node = jsx(ClaudeApi, { children: 'Prompt text' })
    expect(node.type).toBe('claude-api')
  })

  test('accepts model prop', () => {
    const node = jsx(ClaudeApi, { model: 'claude-opus-4' })
    expect(node.props.model).toBe('claude-opus-4')
  })
})

describe('Component composition', () => {
  test('nested components create proper tree structure', () => {
    const stepNode = jsx(Step, { children: 'Step 1' })
    const phaseNode = jsx(Phase, { name: 'test', children: stepNode })

    expect(phaseNode.type).toBe('phase')
    expect(phaseNode.children).toHaveLength(1)
    expect(phaseNode.children[0].type).toBe('step')
  })

  test('serializes nested structure correctly', () => {
    const stepNode = jsx(Step, { children: 'Do work' })
    const phaseNode = jsx(Phase, { name: 'main', children: stepNode })

    const xml = serialize(phaseNode)

    expect(xml).toContain('<phase name="main">')
    expect(xml).toContain('<step>')
    expect(xml).toContain('Do work')
    expect(xml).toContain('</phase>')
  })
})

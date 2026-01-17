import { describe, test, expect } from 'vitest'
import { createSmithersRoot } from '../src/root'
import { Claude } from '../src/components/Claude'
import { serialize } from '../src/serialize'

describe('Claude Component', () => {
  test('renders with execution status', () => {
    const root = createSmithersRoot()

    root.mount(() => (
      <Claude model="sonnet">Test prompt</Claude>
    ))

    const tree = root.getTree()
    const claudeNode = tree.children[0]

    expect(claudeNode.type).toBe('claude')
    // Status will be 'running' or 'complete' since onMount executes synchronously
    expect(['pending', 'running', 'complete']).toContain(claudeNode.props.status)
    expect(claudeNode.props.model).toBe('sonnet')

    root.dispose()
  })

  test('renders execution state to XML', () => {
    const root = createSmithersRoot()

    root.mount(() => (
      <Claude model="sonnet">Test</Claude>
    ))

    const xml = serialize(root.getTree())

    expect(xml).toContain('<claude')
    expect(xml).toContain('status=')
    expect(xml).toContain('model="sonnet"')

    root.dispose()
  })

  test('includes prompt in children', () => {
    const root = createSmithersRoot()

    root.mount(() => (
      <Claude>Research AI agents</Claude>
    ))

    const tree = root.getTree()
    const claudeNode = tree.children[0]

    expect(claudeNode.children[0].type).toBe('TEXT')
    expect(claudeNode.children[0].props.value).toBe('Research AI agents')

    root.dispose()
  })
})

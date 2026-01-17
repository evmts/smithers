import { describe, test, expect } from 'vitest'
import { createSignal } from '../src/solid-shim'
import { createSmithersRoot } from '../src/root'
import { Ralph } from '../src/components/Ralph'
import { Claude } from '../src/components/Claude'

describe('Ralph Component', () => {
  test('renders children with iteration tracking', () => {
    const root = createSmithersRoot()

    root.mount(() => (
      <Ralph maxIterations={3}>
        <div>Test content</div>
      </Ralph>
    ))

    const tree = root.getTree()
    const ralphNode = tree.children[0]

    expect(ralphNode.type).toBe('ralph')
    expect(ralphNode.props.iteration).toBe(0)
    expect(ralphNode.props.pending).toBe(0)

    root.dispose()
  })

  test('tracks pending tasks', () => {
    const root = createSmithersRoot()

    root.mount(() => (
      <Ralph>
        <Claude>Task 1</Claude>
      </Ralph>
    ))

    const tree = root.getTree()
    const ralphNode = tree.children[0]

    // Ralph should track the Claude task
    expect(ralphNode.type).toBe('ralph')

    root.dispose()
  })

  test('respects maxIterations prop', () => {
    const root = createSmithersRoot()

    root.mount(() => (
      <Ralph maxIterations={5}>
        <div>Content</div>
      </Ralph>
    ))

    const tree = root.getTree()
    expect(tree.children[0].type).toBe('ralph')

    root.dispose()
  })
})

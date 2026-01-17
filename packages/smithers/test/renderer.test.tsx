import { describe, test, expect } from 'vitest'
import { createSignal } from '../src/solid-shim'
import { createSmithersRoot } from '../src/root'

describe('Solid Renderer', () => {
  test('renders simple JSX to SmithersNode tree', () => {
    const root = createSmithersRoot()

    root.mount(() => <div>Hello</div>)

    const tree = root.getTree()

    expect(tree.type).toBe('ROOT')
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0].type).toBe('div')
    expect(tree.children[0].children[0].type).toBe('TEXT')
    expect(tree.children[0].children[0].props.value).toBe('Hello')

    root.dispose()
  })

  test('handles props correctly', () => {
    const root = createSmithersRoot()

    root.mount(() => <claude model="sonnet">Test</claude>)

    const tree = root.getTree()
    const claudeNode = tree.children[0]

    expect(claudeNode.type).toBe('claude')
    expect(claudeNode.props.model).toBe('sonnet')

    root.dispose()
  })

  test('updates tree when signal changes', async () => {
    const root = createSmithersRoot()
    let setText: ((v: string) => void) | undefined

    root.mount(() => {
      const [text, _setText] = createSignal('initial')
      setText = _setText
      return <div>{text()}</div>
    })

    const tree = root.getTree()
    const textNode = tree.children[0].children[0]

    expect(textNode.type).toBe('TEXT')
    expect(textNode.props.value).toBe('initial')

    // Update the signal
    setText!('updated')
    await root.flush()

    // Verify the same node instance was mutated in place
    const updatedTextNode = tree.children[0].children[0]
    expect(updatedTextNode).toBe(textNode) // Same object reference
    expect(updatedTextNode.props.value).toBe('updated')

    // Update again to verify multiple updates work
    setText!('final')
    await root.flush()

    expect(tree.children[0].children[0].props.value).toBe('final')

    root.dispose()
  })
})

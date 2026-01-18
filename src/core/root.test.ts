/**
 * Unit tests for root.ts - SmithersRoot creation and mounting.
 */
import { describe, test, expect } from 'bun:test'
import { createSmithersRoot } from './root'
import { jsx } from '../jsx-runtime'

describe('createSmithersRoot', () => {
  test('creates root with mount, getTree, toXML, and dispose methods', () => {
    const root = createSmithersRoot()

    expect(root.mount).toBeDefined()
    expect(root.getTree).toBeDefined()
    expect(root.toXML).toBeDefined()
    expect(root.dispose).toBeDefined()
  })

  test('getTree returns ROOT node initially', () => {
    const root = createSmithersRoot()
    const tree = root.getTree()

    expect(tree.type).toBe('ROOT')
    expect(tree.props).toEqual({})
    expect(tree.children).toEqual([])
    expect(tree.parent).toBeNull()
  })

  test('toXML returns serialized tree', () => {
    const root = createSmithersRoot()

    // Mount a simple component
    root.mount(() => jsx('phase', { name: 'test', children: 'Hello' }))

    const xml = root.toXML()

    expect(xml).toContain('phase')
  })

  test('mount renders component into tree', () => {
    const root = createSmithersRoot()

    root.mount(() => jsx('step', { children: 'Do something' }))

    const tree = root.getTree()

    expect(tree.children.length).toBeGreaterThan(0)
  })

  test('dispose clears children', () => {
    const root = createSmithersRoot()

    root.mount(() => jsx('phase', { name: 'test' }))

    expect(root.getTree().children.length).toBeGreaterThan(0)

    root.dispose()

    expect(root.getTree().children).toEqual([])
  })

  test('dispose can be called multiple times', () => {
    const root = createSmithersRoot()

    root.mount(() => jsx('phase', { name: 'test' }))

    root.dispose()
    root.dispose() // Should not throw

    expect(root.getTree().children).toEqual([])
  })

  test('remounting cleans up previous render', () => {
    const root = createSmithersRoot()

    root.mount(() => jsx('phase', { name: 'first' }))
    root.mount(() => jsx('step', { children: 'second' }))

    const tree = root.getTree()

    // Should have the new component
    expect(tree.children.some(c => c.type === 'step')).toBe(true)
  })
})

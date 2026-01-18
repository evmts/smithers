/**
 * Integration tests for Smithers.
 *
 * NOTE: Full JSX integration tests deferred until Phase 2 JSX configuration is complete.
 * These tests verify the core architecture works without JSX syntax.
 */

import { describe, it, expect } from 'vitest'
import { createSmithersRoot } from '../src/react/root'
import { rendererMethods } from '../src/react/renderer-methods'
import type { SmithersNode } from '../src/core/types'

describe('Integration Tests (Core Architecture)', () => {
  /**
   * Test that we can create a tree structure and serialize it
   */
  it('should create and serialize a multi-level tree', () => {
    const root = createSmithersRoot()

    // Manually create a tree structure (without JSX)
    const ralphNode: SmithersNode = rendererMethods.createElement('ralph')
    rendererMethods.setProperty(ralphNode, 'maxIterations', 3)

    const phaseNode: SmithersNode = rendererMethods.createElement('phase')
    rendererMethods.setProperty(phaseNode, 'name', 'Setup')

    const claudeNode: SmithersNode = rendererMethods.createElement('claude')
    rendererMethods.setProperty(claudeNode, 'model', 'sonnet')

    const textNode: SmithersNode = rendererMethods.createTextNode('Initialize the system')

    // Build tree structure
    rendererMethods.insertNode(claudeNode, textNode)
    rendererMethods.insertNode(phaseNode, claudeNode)
    rendererMethods.insertNode(ralphNode, phaseNode)

    // Add to root
    const rootTree = root.getTree()
    rendererMethods.insertNode(rootTree, ralphNode)

    // Verify tree structure
    expect(rootTree.children).toHaveLength(1)
    expect(rootTree.children[0].type).toBe('ralph')
    expect(rootTree.children[0].props.maxIterations).toBe(3)
    expect(rootTree.children[0].children[0].type).toBe('phase')
    expect(rootTree.children[0].children[0].props.name).toBe('Setup')

    // Verify XML serialization
    const xml = root.toXML()
    expect(xml).toContain('<ralph')
    expect(xml).toContain('maxIterations="3"')
    expect(xml).toContain('<phase')
    expect(xml).toContain('name="Setup"')
    expect(xml).toContain('<claude')
    expect(xml).toContain('model="sonnet"')
    expect(xml).toContain('Initialize the system')

    root.dispose()
  })

  /**
   * Test tree manipulation (add/remove nodes)
   */
  it('should support dynamic tree manipulation', () => {
    const root = createSmithersRoot()
    const rootTree = root.getTree()

    // Create parent
    const parent = rendererMethods.createElement('container')
    rendererMethods.insertNode(rootTree, parent)

    // Add multiple children
    const child1 = rendererMethods.createElement('task')
    rendererMethods.setProperty(child1, 'name', 'task1')
    rendererMethods.insertNode(parent, child1)

    const child2 = rendererMethods.createElement('task')
    rendererMethods.setProperty(child2, 'name', 'task2')
    rendererMethods.insertNode(parent, child2)

    expect(parent.children).toHaveLength(2)

    // Remove one child
    rendererMethods.removeNode(parent, child1)
    expect(parent.children).toHaveLength(1)
    expect(parent.children[0]).toBe(child2)

    root.dispose()
  })

  /**
   * Test key-based reconciliation
   */
  it('should handle key prop for Ralph Wiggum loop', () => {
    const root = createSmithersRoot()
    const rootTree = root.getTree()

    // Create node with key
    const node1 = rendererMethods.createElement('ralph')
    rendererMethods.setProperty(node1, 'key', 'iteration-1')
    rendererMethods.insertNode(rootTree, node1)

    expect(node1.key).toBe('iteration-1')

    // Change key (simulates remount)
    const node2 = rendererMethods.createElement('ralph')
    rendererMethods.setProperty(node2, 'key', 'iteration-2')

    expect(node2.key).toBe('iteration-2')
    expect(node2.key).not.toBe(node1.key)

    root.dispose()
  })

  /**
   * Test XML escaping in complex structures
   */
  it('should properly escape XML entities in nested structures', () => {
    const root = createSmithersRoot()
    const rootTree = root.getTree()

    const parent = rendererMethods.createElement('claude')
    const textNode = rendererMethods.createTextNode('Test & < > " \' special chars')
    rendererMethods.insertNode(parent, textNode)
    rendererMethods.insertNode(rootTree, parent)

    const xml = root.toXML()

    // Verify entities are escaped
    expect(xml).toContain('&amp;')
    expect(xml).toContain('&lt;')
    expect(xml).toContain('&gt;')
    expect(xml).toContain('&quot;')
    expect(xml).toContain('&apos;')

    // Verify NOT double-escaped
    expect(xml).not.toContain('&amp;amp;')
    expect(xml).not.toContain('&amp;lt;')

    root.dispose()
  })

  /**
   * Test signal-based updates (text replacement)
   */
  it('should support in-place text updates via replaceText', () => {
    const textNode = rendererMethods.createTextNode('Initial')
    expect(textNode.props.value).toBe('Initial')

    // Simulate signal update
    rendererMethods.replaceText(textNode, 'Updated')
    expect(textNode.props.value).toBe('Updated')

    // This is the CRITICAL pattern for fine-grained reactivity
    expect(textNode.type).toBe('TEXT')
  })

  /**
   * Test hierarchical structure with multiple levels
   */
  it('should handle deeply nested structures', () => {
    const root = createSmithersRoot()
    const rootTree = root.getTree()

    // Level 1
    const level1 = rendererMethods.createElement('ralph')
    rendererMethods.insertNode(rootTree, level1)

    // Level 2
    const level2 = rendererMethods.createElement('phase')
    rendererMethods.setProperty(level2, 'name', 'outer')
    rendererMethods.insertNode(level1, level2)

    // Level 3
    const level3 = rendererMethods.createElement('step')
    rendererMethods.insertNode(level2, level3)

    // Level 4
    const level4 = rendererMethods.createElement('claude')
    rendererMethods.setProperty(level4, 'model', 'opus')
    rendererMethods.insertNode(level3, level4)

    // Level 5
    const level5 = rendererMethods.createTextNode('Deep content')
    rendererMethods.insertNode(level4, level5)

    // Verify parent chain
    expect(level5.parent).toBe(level4)
    expect(level4.parent).toBe(level3)
    expect(level3.parent).toBe(level2)
    expect(level2.parent).toBe(level1)
    expect(level1.parent).toBe(rootTree)

    // Verify XML indentation
    const xml = root.toXML()
    expect(xml).toContain('  <phase')    // 2 spaces
    expect(xml).toContain('    <step')   // 4 spaces
    expect(xml).toContain('      <claude') // 6 spaces

    root.dispose()
  })

  /**
   * Test tree traversal methods
   */
  it('should support tree traversal operations', () => {
    const parent = rendererMethods.createElement('container')
    const child1 = rendererMethods.createElement('task')
    const child2 = rendererMethods.createElement('task')
    const child3 = rendererMethods.createElement('task')

    rendererMethods.insertNode(parent, child1)
    rendererMethods.insertNode(parent, child2)
    rendererMethods.insertNode(parent, child3)

    // Test getFirstChild
    expect(rendererMethods.getFirstChild(parent)).toBe(child1)

    // Test getNextSibling
    expect(rendererMethods.getNextSibling(child1)).toBe(child2)
    expect(rendererMethods.getNextSibling(child2)).toBe(child3)
    expect(rendererMethods.getNextSibling(child3)).toBeUndefined()

    // Test getParentNode
    expect(rendererMethods.getParentNode(child1)).toBe(parent)
    expect(rendererMethods.getParentNode(child2)).toBe(parent)
    expect(rendererMethods.getParentNode(child3)).toBe(parent)
  })
})

/**
 * Integration tests for Smithers.
 *
 * NOTE: Full JSX integration tests deferred until Phase 2 JSX configuration is complete.
 * These tests verify the core architecture works without JSX syntax.
 */

import { describe, it, expect, afterEach } from 'bun:test'
import { createSmithersRoot } from '../src/reconciler/root'
import { rendererMethods } from '../src/reconciler/methods'
import type { SmithersNode } from '../src/reconciler/types'

const roots: Array<ReturnType<typeof createSmithersRoot>> = []

const createRoot = () => {
  const root = createSmithersRoot()
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots) {
    root.dispose()
  }
  roots.length = 0
})

describe('Integration Tests (Core Architecture)', () => {
  /**
   * Test that we can create a tree structure and serialize it
   */
  it('should create and serialize a multi-level tree', () => {
    const root = createRoot()

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

  })

  /**
   * Test tree manipulation (add/remove nodes)
   */
  it('should support dynamic tree manipulation', () => {
    const root = createRoot()
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

  })

  /**
   * Test key-based reconciliation
   */
  it('should handle key prop for Ralph Wiggum loop', () => {
    const root = createRoot()
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

  })

  /**
   * Test XML escaping in complex structures
   */
  it('should properly escape XML entities in nested structures', () => {
    const root = createRoot()
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
    const root = createRoot()
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

    // Verify XML structure order
    const xml = root.toXML()
    const phasePos = xml.indexOf('<phase')
    const stepPos = xml.indexOf('<step')
    const claudePos = xml.indexOf('<claude')
    expect(phasePos).toBeGreaterThan(-1)
    expect(stepPos).toBeGreaterThan(-1)
    expect(claudePos).toBeGreaterThan(-1)
    expect(phasePos).toBeLessThan(stepPos)
    expect(stepPos).toBeLessThan(claudePos)
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

  /**
   * Test anchor-based insertion (insertBefore equivalent)
   */
  it('should insert node before anchor', () => {
    const parent = rendererMethods.createElement('container')
    const child1 = rendererMethods.createElement('task')
    const child2 = rendererMethods.createElement('task')
    const child3 = rendererMethods.createElement('task')

    rendererMethods.insertNode(parent, child1)
    rendererMethods.insertNode(parent, child3)
    // Insert child2 BEFORE child3
    rendererMethods.insertNode(parent, child2, child3)

    expect(parent.children).toHaveLength(3)
    expect(parent.children[0]).toBe(child1)
    expect(parent.children[1]).toBe(child2)
    expect(parent.children[2]).toBe(child3)
  })

  /**
   * Test anchor not found falls back to append
   */
  it('should append if anchor not found', () => {
    const parent = rendererMethods.createElement('container')
    const child1 = rendererMethods.createElement('task')
    const child2 = rendererMethods.createElement('task')
    const orphanAnchor = rendererMethods.createElement('task') // not in parent

    rendererMethods.insertNode(parent, child1)
    rendererMethods.insertNode(parent, child2, orphanAnchor)

    expect(parent.children).toHaveLength(2)
    expect(parent.children[1]).toBe(child2) // appended
  })

  /**
   * Test cross-parent node movement
   */
  it('should move node from one parent to another', () => {
    const parent1 = rendererMethods.createElement('container')
    const parent2 = rendererMethods.createElement('container')
    const child = rendererMethods.createElement('task')

    rendererMethods.insertNode(parent1, child)
    expect(parent1.children).toHaveLength(1)
    expect(child.parent).toBe(parent1)

    // Move to parent2
    rendererMethods.insertNode(parent2, child)
    expect(parent1.children).toHaveLength(0)
    expect(parent2.children).toHaveLength(1)
    expect(child.parent).toBe(parent2)
  })

  /**
   * Test same-parent reordering
   */
  it('should reorder node within same parent', () => {
    const parent = rendererMethods.createElement('container')
    const child1 = rendererMethods.createElement('task')
    const child2 = rendererMethods.createElement('task')
    const child3 = rendererMethods.createElement('task')

    rendererMethods.insertNode(parent, child1)
    rendererMethods.insertNode(parent, child2)
    rendererMethods.insertNode(parent, child3)

    // Move child3 before child1
    rendererMethods.insertNode(parent, child3, child1)

    expect(parent.children).toHaveLength(3)
    expect(parent.children[0]).toBe(child3)
    expect(parent.children[1]).toBe(child1)
    expect(parent.children[2]).toBe(child2)
  })

  /**
   * Test removeNode clears parent pointers recursively
   */
  it('should clear parent pointers on descendants when removing subtree', () => {
    const root = createRoot()
    const rootTree = root.getTree()

    const parent = rendererMethods.createElement('container')
    const child = rendererMethods.createElement('task')
    const grandchild = rendererMethods.createElement('step')

    rendererMethods.insertNode(child, grandchild)
    rendererMethods.insertNode(parent, child)
    rendererMethods.insertNode(rootTree, parent)

    expect(grandchild.parent).toBe(child)
    expect(child.parent).toBe(parent)

    // Remove parent (should clear all descendant parents)
    rendererMethods.removeNode(rootTree, parent)

    expect(parent.parent).toBeNull()
    expect(child.parent).toBeNull()
    expect(grandchild.parent).toBeNull()

  })

  /**
   * Test isTextNode helper
   */
  it('should correctly identify text nodes', () => {
    const textNode = rendererMethods.createTextNode('hello')
    const elementNode = rendererMethods.createElement('div')

    expect(rendererMethods.isTextNode(textNode)).toBe(true)
    expect(rendererMethods.isTextNode(elementNode)).toBe(false)
  })

  /**
   * Test getNextSibling returns undefined for orphan nodes
   */
  it('should return undefined for orphan node sibling', () => {
    const orphan = rendererMethods.createElement('task')
    expect(rendererMethods.getNextSibling(orphan)).toBeUndefined()
  })

  /**
   * Test empty root serialization
   */
  it('should serialize empty root as empty string', () => {
    const root = createRoot()
    const xml = root.toXML()
    expect(xml).toBe('')
  })
})

import React from 'react'
import { SmithersReconciler } from '../src/reconciler/host-config'
import { serialize } from '../src/reconciler/serialize'

describe('Host-config integration tests', () => {
  it('should remove props on update', async () => {
    const root = createRoot()
    const container = root.getTree()

    const fiberRoot = SmithersReconciler.createContainer(container, 0, null, false, null, '', () => {}, null)

    SmithersReconciler.updateContainer(
      React.createElement('task', { name: 'test' }),
      fiberRoot,
      null,
      () => {}
    )
    await new Promise(r => setTimeout(r, 0))

    let xml = root.toXML()
    expect(xml).toContain('name="test"')

    SmithersReconciler.updateContainer(
      React.createElement('task', {}),
      fiberRoot,
      null,
      () => {}
    )
    await new Promise(r => setTimeout(r, 0))

    xml = root.toXML()
    expect(xml).not.toContain('name=')

  })

  it('should handle __smithersKey appearing first in XML', async () => {
    const root = createRoot()
    const container = root.getTree()

    const fiberRoot = SmithersReconciler.createContainer(container, 0, null, false, null, '', () => {}, null)

    SmithersReconciler.updateContainer(
      React.createElement('task', { __smithersKey: 'k1', name: 'myTask' }),
      fiberRoot,
      null,
      () => {}
    )
    await new Promise(r => setTimeout(r, 0))

    const xml = root.toXML()
    expect(xml).toContain('key="k1"')
    const keyPos = xml.indexOf('key="k1"')
    const namePos = xml.indexOf('name="myTask"')
    expect(keyPos).toBeLessThan(namePos)

  })

  it('should update key from k1 to k2', async () => {
    const root = createRoot()
    const container = root.getTree()

    const fiberRoot = SmithersReconciler.createContainer(container, 0, null, false, null, '', () => {}, null)

    SmithersReconciler.updateContainer(
      React.createElement('task', { __smithersKey: 'k1' }),
      fiberRoot,
      null,
      () => {}
    )
    await new Promise(r => setTimeout(r, 0))

    let xml = root.toXML()
    expect(xml).toContain('key="k1"')

    SmithersReconciler.updateContainer(
      React.createElement('task', { __smithersKey: 'k2' }),
      fiberRoot,
      null,
      () => {}
    )
    await new Promise(r => setTimeout(r, 0))

    xml = root.toXML()
    expect(xml).toContain('key="k2"')
    expect(xml).not.toContain('key="k1"')

  })

  it('should remove key when __smithersKey set to undefined', async () => {
    const root = createRoot()
    const container = root.getTree()

    const fiberRoot = SmithersReconciler.createContainer(container, 0, null, false, null, '', () => {}, null)

    SmithersReconciler.updateContainer(
      React.createElement('task', { __smithersKey: 'k1' }),
      fiberRoot,
      null,
      () => {}
    )
    await new Promise(r => setTimeout(r, 0))

    let xml = root.toXML()
    expect(xml).toContain('key="k1"')

    SmithersReconciler.updateContainer(
      React.createElement('task', {}),
      fiberRoot,
      null,
      () => {}
    )
    await new Promise(r => setTimeout(r, 0))

    xml = root.toXML()
    expect(xml).not.toContain('key=')

  })
})

describe('Warning tests for unknown parent detection', () => {
  it('should add warning when known component is inside unknown element', () => {
    const root = createRoot()
    const rootTree = root.getTree()

    const loopNode = rendererMethods.createElement('loop')
    const claudeNode = rendererMethods.createElement('claude')
    rendererMethods.insertNode(loopNode, claudeNode)
    rendererMethods.insertNode(rootTree, loopNode)

    serialize(rootTree)

    expect(claudeNode.warnings).toBeDefined()
    expect(claudeNode.warnings).toHaveLength(1)
    expect(claudeNode.warnings![0]).toContain('<claude> rendered inside unknown element <loop>')

  })

  it('should clear warnings on subsequent serialize() calls (idempotency)', () => {
    const root = createRoot()
    const rootTree = root.getTree()

    const loopNode = rendererMethods.createElement('loop')
    const claudeNode = rendererMethods.createElement('claude')
    rendererMethods.insertNode(loopNode, claudeNode)
    rendererMethods.insertNode(rootTree, loopNode)

    serialize(rootTree)
    expect(claudeNode.warnings).toBeDefined()
    expect(claudeNode.warnings).toHaveLength(1)

    serialize(rootTree)
    expect(claudeNode.warnings).toBeDefined()
    expect(claudeNode.warnings).toHaveLength(1)

    rendererMethods.removeNode(loopNode, claudeNode)
    const phaseNode = rendererMethods.createElement('phase')
    rendererMethods.insertNode(phaseNode, claudeNode)
    rendererMethods.insertNode(rootTree, phaseNode)

    serialize(rootTree)
    expect(claudeNode.warnings).toBeUndefined()

  })
})

describe('Prop filtering tests', () => {
  it('should not include callbacks in XML', () => {
    const root = createRoot()
    const rootTree = root.getTree()

    const taskNode = rendererMethods.createElement('task')
    rendererMethods.setProperty(taskNode, 'name', 'myTask')
    rendererMethods.setProperty(taskNode, 'onFinished', () => {})
    rendererMethods.setProperty(taskNode, 'onError', () => {})
    rendererMethods.insertNode(rootTree, taskNode)

    const xml = root.toXML()
    expect(xml).toContain('name="myTask"')
    expect(xml).not.toContain('onFinished')
    expect(xml).not.toContain('onError')

  })

  it('should not include middleware arrays containing functions in XML', () => {
    const root = createRoot()
    const rootTree = root.getTree()

    const taskNode = rendererMethods.createElement('task')
    rendererMethods.setProperty(taskNode, 'name', 'myTask')
    rendererMethods.setProperty(taskNode, 'middleware', [() => {}, () => {}])
    rendererMethods.insertNode(rootTree, taskNode)

    const xml = root.toXML()
    expect(xml).toContain('name="myTask"')
    expect(xml).not.toContain('middleware')

  })

  it('should include plain objects as JSON stringified in XML', () => {
    const root = createRoot()
    const rootTree = root.getTree()

    const taskNode = rendererMethods.createElement('task')
    rendererMethods.setProperty(taskNode, 'config', { timeout: 5000, retries: 3 })
    rendererMethods.insertNode(rootTree, taskNode)

    const xml = root.toXML()
    expect(xml).toContain('config=')
    expect(xml).toContain('timeout')
    expect(xml).toContain('5000')
    expect(xml).toContain('retries')
    expect(xml).toContain('3')

  })

  it('should detect and filter functions nested in objects', () => {
    const root = createRoot()
    const rootTree = root.getTree()

    const taskNode = rendererMethods.createElement('task')
    rendererMethods.setProperty(taskNode, 'name', 'myTask')
    rendererMethods.setProperty(taskNode, 'handlers', { onSuccess: () => {}, data: 'test' })
    rendererMethods.insertNode(rootTree, taskNode)

    const xml = root.toXML()
    expect(xml).toContain('name="myTask"')
    expect(xml).not.toContain('handlers')

  })

  it('should detect and filter functions nested in arrays', () => {
    const root = createRoot()
    const rootTree = root.getTree()

    const taskNode = rendererMethods.createElement('task')
    rendererMethods.setProperty(taskNode, 'name', 'myTask')
    rendererMethods.setProperty(taskNode, 'steps', ['step1', () => {}, 'step3'])
    rendererMethods.insertNode(rootTree, taskNode)

    const xml = root.toXML()
    expect(xml).toContain('name="myTask"')
    expect(xml).not.toContain('steps')

  })
})

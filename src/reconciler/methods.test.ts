/**
 * Unit tests for methods.ts - SmithersNode manipulation methods.
 * These are the low-level tree operations used by the React reconciler.
 */
import { describe, test, expect } from 'bun:test'
import { rendererMethods } from './methods.js'
import type { SmithersNode } from './types.js'

describe('rendererMethods', () => {
  describe('createElement', () => {
    test('creates node with correct type', () => {
      const node = rendererMethods.createElement('phase')
      expect(node.type).toBe('phase')
    })

    test('creates node with empty props', () => {
      const node = rendererMethods.createElement('step')
      expect(node.props).toEqual({})
    })

    test('creates node with empty children array', () => {
      const node = rendererMethods.createElement('task')
      expect(node.children).toEqual([])
    })

    test('creates node with null parent', () => {
      const node = rendererMethods.createElement('claude')
      expect(node.parent).toBeNull()
    })
  })

  describe('createTextNode', () => {
    test('creates TEXT node', () => {
      const node = rendererMethods.createTextNode('hello')
      expect(node.type).toBe('TEXT')
    })

    test('stores text in props.value', () => {
      const node = rendererMethods.createTextNode('world')
      expect(node.props.value).toBe('world')
    })

    test('creates node with empty children', () => {
      const node = rendererMethods.createTextNode('test')
      expect(node.children).toEqual([])
    })

    test('handles empty string', () => {
      const node = rendererMethods.createTextNode('')
      expect(node.props.value).toBe('')
    })
  })

  describe('replaceText', () => {
    test('updates text node value', () => {
      const node = rendererMethods.createTextNode('old')
      rendererMethods.replaceText(node, 'new')
      expect(node.props.value).toBe('new')
    })

    test('handles empty string replacement', () => {
      const node = rendererMethods.createTextNode('content')
      rendererMethods.replaceText(node, '')
      expect(node.props.value).toBe('')
    })
  })

  describe('setProperty', () => {
    test('sets prop on node', () => {
      const node = rendererMethods.createElement('task')
      rendererMethods.setProperty(node, 'name', 'test')
      expect(node.props.name).toBe('test')
    })

    test('ignores children prop', () => {
      const node = rendererMethods.createElement('task')
      rendererMethods.setProperty(node, 'children', 'ignored')
      expect(node.props.children).toBeUndefined()
    })

    test('sets __smithersKey to node.key', () => {
      const node = rendererMethods.createElement('task')
      rendererMethods.setProperty(node, '__smithersKey', 'my-key')
      expect(node.key).toBe('my-key')
      expect(node.props.__smithersKey).toBeUndefined()
    })

    test('sets key prop to node.key', () => {
      const node = rendererMethods.createElement('task')
      rendererMethods.setProperty(node, 'key', 'direct-key')
      expect(node.key).toBe('direct-key')
      expect(node.props.key).toBeUndefined()
    })

    test('handles numeric key', () => {
      const node = rendererMethods.createElement('task')
      rendererMethods.setProperty(node, 'key', 42)
      expect(node.key).toBe(42)
    })
  })

  describe('insertNode', () => {
    test('appends child to parent', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('step')
      rendererMethods.insertNode(parent, child)
      expect(parent.children).toContain(child)
      expect(parent.children).toHaveLength(1)
    })

    test('sets parent reference', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('step')
      rendererMethods.insertNode(parent, child)
      expect(child.parent).toBe(parent)
    })

    test('inserts before anchor', () => {
      const parent = rendererMethods.createElement('phase')
      const first = rendererMethods.createElement('step')
      const second = rendererMethods.createElement('step')
      const third = rendererMethods.createElement('step')
      rendererMethods.insertNode(parent, first)
      rendererMethods.insertNode(parent, third)
      rendererMethods.insertNode(parent, second, third)
      expect(parent.children[0]).toBe(first)
      expect(parent.children[1]).toBe(second)
      expect(parent.children[2]).toBe(third)
    })

    test('handles anchor not found (appends)', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('step')
      const fakeAnchor = rendererMethods.createElement('fake')
      rendererMethods.insertNode(parent, child, fakeAnchor)
      expect(parent.children).toContain(child)
    })

    test('removes from old parent on cross-parent move', () => {
      const oldParent = rendererMethods.createElement('old')
      const newParent = rendererMethods.createElement('new')
      const child = rendererMethods.createElement('child')
      rendererMethods.insertNode(oldParent, child)
      expect(oldParent.children).toContain(child)
      rendererMethods.insertNode(newParent, child)
      expect(oldParent.children).not.toContain(child)
      expect(newParent.children).toContain(child)
      expect(child.parent).toBe(newParent)
    })

    test('handles same-parent reorder', () => {
      const parent = rendererMethods.createElement('phase')
      const a = rendererMethods.createElement('a')
      const b = rendererMethods.createElement('b')
      const c = rendererMethods.createElement('c')
      rendererMethods.insertNode(parent, a)
      rendererMethods.insertNode(parent, b)
      rendererMethods.insertNode(parent, c)
      expect(parent.children).toEqual([a, b, c])
      rendererMethods.insertNode(parent, c, a)
      expect(parent.children).toEqual([c, a, b])
    })
  })

  describe('removeNode', () => {
    test('removes child from parent', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('step')
      rendererMethods.insertNode(parent, child)
      rendererMethods.removeNode(parent, child)
      expect(parent.children).not.toContain(child)
    })

    test('clears parent reference', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('step')
      rendererMethods.insertNode(parent, child)
      rendererMethods.removeNode(parent, child)
      expect(child.parent).toBeNull()
    })

    test('clears descendant parent pointers', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('step')
      const grandchild = rendererMethods.createElement('task')
      rendererMethods.insertNode(parent, child)
      rendererMethods.insertNode(child, grandchild)
      rendererMethods.removeNode(parent, child)
      expect(child.parent).toBeNull()
      expect(grandchild.parent).toBeNull()
    })

    test('handles node not in children array', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('step')
      child.parent = parent
      rendererMethods.removeNode(parent, child)
      expect(child.parent).toBeNull()
    })
  })

  describe('isTextNode', () => {
    test('returns true for TEXT nodes', () => {
      const text = rendererMethods.createTextNode('hello')
      expect(rendererMethods.isTextNode(text)).toBe(true)
    })

    test('returns false for element nodes', () => {
      const elem = rendererMethods.createElement('div')
      expect(rendererMethods.isTextNode(elem)).toBe(false)
    })
  })

  describe('getParentNode', () => {
    test('returns parent when exists', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('step')
      rendererMethods.insertNode(parent, child)
      expect(rendererMethods.getParentNode(child)).toBe(parent)
    })

    test('returns undefined when no parent', () => {
      const node = rendererMethods.createElement('orphan')
      expect(rendererMethods.getParentNode(node)).toBeUndefined()
    })
  })

  describe('getFirstChild', () => {
    test('returns first child', () => {
      const parent = rendererMethods.createElement('phase')
      const first = rendererMethods.createElement('first')
      const second = rendererMethods.createElement('second')
      rendererMethods.insertNode(parent, first)
      rendererMethods.insertNode(parent, second)
      expect(rendererMethods.getFirstChild(parent)).toBe(first)
    })

    test('returns undefined when no children', () => {
      const parent = rendererMethods.createElement('empty')
      expect(rendererMethods.getFirstChild(parent)).toBeUndefined()
    })
  })

  describe('getNextSibling', () => {
    test('returns next sibling', () => {
      const parent = rendererMethods.createElement('phase')
      const first = rendererMethods.createElement('first')
      const second = rendererMethods.createElement('second')
      rendererMethods.insertNode(parent, first)
      rendererMethods.insertNode(parent, second)
      expect(rendererMethods.getNextSibling(first)).toBe(second)
    })

    test('returns undefined for last child', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('only')
      rendererMethods.insertNode(parent, child)
      expect(rendererMethods.getNextSibling(child)).toBeUndefined()
    })

    test('returns undefined when no parent', () => {
      const orphan = rendererMethods.createElement('orphan')
      expect(rendererMethods.getNextSibling(orphan)).toBeUndefined()
    })

    test('returns undefined when not in parent children', () => {
      const parent = rendererMethods.createElement('parent')
      const detached: SmithersNode = {
        type: 'detached',
        props: {},
        children: [],
        parent: parent,
      }
      expect(rendererMethods.getNextSibling(detached)).toBeUndefined()
    })
  })
})

describe('rendererMethods - Edge Cases', () => {
  describe('createElement edge cases', () => {
    test('createElement with empty type string', () => {
      const node = rendererMethods.createElement('')
      expect(node.type).toBe('')
      expect(node.props).toEqual({})
      expect(node.children).toEqual([])
    })

    test('createElement with special characters in type', () => {
      const node = rendererMethods.createElement('my-custom-element_v2')
      expect(node.type).toBe('my-custom-element_v2')
    })

    test('createElement with very long type name', () => {
      const longType = 'a'.repeat(1000)
      const node = rendererMethods.createElement(longType)
      expect(node.type).toBe(longType)
      expect(node.type.length).toBe(1000)
    })

    test('createElement with unicode type', () => {
      const node = rendererMethods.createElement('日本語要素')
      expect(node.type).toBe('日本語要素')
    })

    test('createElement with emoji type', () => {
      const node = rendererMethods.createElement('🚀-element')
      expect(node.type).toBe('🚀-element')
    })
  })

  describe('createTextNode edge cases', () => {
    test('createTextNode with special characters', () => {
      const node = rendererMethods.createTextNode('Hello <world> & "quotes"')
      expect(node.props.value).toBe('Hello <world> & "quotes"')
    })

    test('createTextNode with unicode', () => {
      const node = rendererMethods.createTextNode('こんにちは世界 🌍')
      expect(node.props.value).toBe('こんにちは世界 🌍')
    })

    test('createTextNode with newlines', () => {
      const text = 'Line 1\nLine 2\nLine 3'
      const node = rendererMethods.createTextNode(text)
      expect(node.props.value).toBe(text)
      expect(node.props.value).toContain('\n')
    })

    test('createTextNode with very long text', () => {
      const longText = 'x'.repeat(100000)
      const node = rendererMethods.createTextNode(longText)
      expect(node.props.value).toBe(longText)
      expect((node.props.value as string).length).toBe(100000)
    })

    test('createTextNode with tabs and special whitespace', () => {
      const node = rendererMethods.createTextNode('\t\n\r  mixed whitespace  ')
      expect(node.props.value).toBe('\t\n\r  mixed whitespace  ')
    })

    test('createTextNode with null bytes', () => {
      const node = rendererMethods.createTextNode('before\0after')
      expect(node.props.value).toBe('before\0after')
    })
  })

  describe('setProperty edge cases', () => {
    test('setProperty overwrites existing prop', () => {
      const node = rendererMethods.createElement('task')
      rendererMethods.setProperty(node, 'name', 'original')
      expect(node.props.name).toBe('original')
      rendererMethods.setProperty(node, 'name', 'updated')
      expect(node.props.name).toBe('updated')
    })

    test('setProperty with undefined value', () => {
      const node = rendererMethods.createElement('task')
      rendererMethods.setProperty(node, 'value', undefined)
      expect(node.props.value).toBeUndefined()
    })

    test('setProperty with null value', () => {
      const node = rendererMethods.createElement('task')
      rendererMethods.setProperty(node, 'value', null)
      expect(node.props.value).toBeNull()
    })

    test('setProperty with object value', () => {
      const node = rendererMethods.createElement('task')
      const obj = { nested: { deep: 'value' } }
      rendererMethods.setProperty(node, 'config', obj)
      expect(node.props.config).toBe(obj)
      expect((node.props.config as any).nested.deep).toBe('value')
    })

    test('setProperty with array value', () => {
      const node = rendererMethods.createElement('task')
      const arr = [1, 2, { key: 'value' }]
      rendererMethods.setProperty(node, 'items', arr)
      expect(node.props.items).toBe(arr)
      expect((node.props.items as any)[2].key).toBe('value')
    })

    test('setProperty with function value', () => {
      const node = rendererMethods.createElement('task')
      const fn = () => 'result'
      rendererMethods.setProperty(node, 'callback', fn)
      expect(node.props.callback).toBe(fn)
      expect((node.props.callback as Function)()).toBe('result')
    })

    test('setProperty with boolean values', () => {
      const node = rendererMethods.createElement('task')
      rendererMethods.setProperty(node, 'enabled', true)
      rendererMethods.setProperty(node, 'disabled', false)
      expect(node.props.enabled).toBe(true)
      expect(node.props.disabled).toBe(false)
    })

    test('setProperty with symbol value', () => {
      const node = rendererMethods.createElement('task')
      const sym = Symbol('test')
      rendererMethods.setProperty(node, 'symbol', sym)
      expect(node.props.symbol).toBe(sym)
    })

    test('setProperty with empty string key', () => {
      const node = rendererMethods.createElement('task')
      rendererMethods.setProperty(node, '', 'empty-key-value')
      expect(node.props['']).toBe('empty-key-value')
    })
  })

  describe('insertNode edge cases', () => {
    test('insertNode with node already at correct position', () => {
      const parent = rendererMethods.createElement('phase')
      const a = rendererMethods.createElement('a')
      const b = rendererMethods.createElement('b')
      rendererMethods.insertNode(parent, a)
      rendererMethods.insertNode(parent, b)
      expect(parent.children).toEqual([a, b])
      
      // Re-insert b at end (same position) - should remain stable
      rendererMethods.insertNode(parent, b)
      expect(parent.children).toEqual([a, b])
    })

    test('insertNode with anchor at position 0', () => {
      const parent = rendererMethods.createElement('phase')
      const first = rendererMethods.createElement('first')
      const newFirst = rendererMethods.createElement('new-first')
      rendererMethods.insertNode(parent, first)
      rendererMethods.insertNode(parent, newFirst, first)
      expect(parent.children[0]).toBe(newFirst)
      expect(parent.children[1]).toBe(first)
    })

    test('insertNode with many children (performance)', () => {
      const parent = rendererMethods.createElement('phase')
      const children: SmithersNode[] = []
      
      // Insert 1000 children
      for (let i = 0; i < 1000; i++) {
        const child = rendererMethods.createElement(`child-${i}`)
        children.push(child)
        rendererMethods.insertNode(parent, child)
      }
      
      expect(parent.children.length).toBe(1000)
      expect(parent.children[0]).toBe(children[0])
      expect(parent.children[999]).toBe(children[999])
    })

    test('insertNode reorder in middle of list', () => {
      const parent = rendererMethods.createElement('phase')
      const nodes = Array.from({ length: 5 }, (_, i) => 
        rendererMethods.createElement(`node-${i}`)
      )
      nodes.forEach(n => rendererMethods.insertNode(parent, n))
      expect(parent.children.map(c => c.type)).toEqual([
        'node-0', 'node-1', 'node-2', 'node-3', 'node-4'
      ])
      
      // Move node-4 before node-2
      rendererMethods.insertNode(parent, nodes[4], nodes[2])
      expect(parent.children.map(c => c.type)).toEqual([
        'node-0', 'node-1', 'node-4', 'node-2', 'node-3'
      ])
    })

    test('insertNode with anchor that is the node itself', () => {
      const parent = rendererMethods.createElement('phase')
      const node = rendererMethods.createElement('node')
      rendererMethods.insertNode(parent, node)
      
      // Insert node before itself (edge case)
      rendererMethods.insertNode(parent, node, node)
      expect(parent.children.length).toBe(1)
      expect(parent.children[0]).toBe(node)
    })
  })

  describe('removeNode edge cases', () => {
    test('removeNode deeply nested descendants (3 levels)', () => {
      const parent = rendererMethods.createElement('root')
      const child = rendererMethods.createElement('level1')
      const grandchild = rendererMethods.createElement('level2')
      const greatGrandchild = rendererMethods.createElement('level3')
      
      rendererMethods.insertNode(parent, child)
      rendererMethods.insertNode(child, grandchild)
      rendererMethods.insertNode(grandchild, greatGrandchild)
      
      expect(greatGrandchild.parent).toBe(grandchild)
      
      rendererMethods.removeNode(parent, child)
      
      expect(child.parent).toBeNull()
      expect(grandchild.parent).toBeNull()
      expect(greatGrandchild.parent).toBeNull()
    })

    test('removeNode with multiple children at each level', () => {
      const parent = rendererMethods.createElement('root')
      const child = rendererMethods.createElement('child')
      const gc1 = rendererMethods.createElement('gc1')
      const gc2 = rendererMethods.createElement('gc2')
      const ggc1 = rendererMethods.createElement('ggc1')
      const ggc2 = rendererMethods.createElement('ggc2')
      
      rendererMethods.insertNode(parent, child)
      rendererMethods.insertNode(child, gc1)
      rendererMethods.insertNode(child, gc2)
      rendererMethods.insertNode(gc1, ggc1)
      rendererMethods.insertNode(gc2, ggc2)
      
      rendererMethods.removeNode(parent, child)
      
      expect(child.parent).toBeNull()
      expect(gc1.parent).toBeNull()
      expect(gc2.parent).toBeNull()
      expect(ggc1.parent).toBeNull()
      expect(ggc2.parent).toBeNull()
    })

    test('removeNode when node not in parent', () => {
      const parent1 = rendererMethods.createElement('parent1')
      const parent2 = rendererMethods.createElement('parent2')
      const child = rendererMethods.createElement('child')
      
      rendererMethods.insertNode(parent1, child)
      
      // Try to remove from wrong parent
      rendererMethods.removeNode(parent2, child)
      
      // Child should still be in parent1
      expect(parent1.children).toContain(child)
      expect(child.parent).toBe(parent1)
    })

    test('removeNode called twice on same node', () => {
      const parent = rendererMethods.createElement('parent')
      const child = rendererMethods.createElement('child')
      
      rendererMethods.insertNode(parent, child)
      rendererMethods.removeNode(parent, child)
      
      expect(parent.children).not.toContain(child)
      expect(child.parent).toBeNull()
      
      // Remove again - should be idempotent
      rendererMethods.removeNode(parent, child)
      expect(parent.children).not.toContain(child)
      expect(child.parent).toBeNull()
    })
  })

  describe('replaceText edge cases', () => {
    test('replaceText with special XML characters', () => {
      const node = rendererMethods.createTextNode('initial')
      rendererMethods.replaceText(node, '<script>alert("xss")</script>')
      expect(node.props.value).toBe('<script>alert("xss")</script>')
    })

    test('replaceText with unicode', () => {
      const node = rendererMethods.createTextNode('initial')
      rendererMethods.replaceText(node, '你好世界 🎉')
      expect(node.props.value).toBe('你好世界 🎉')
    })

    test('replaceText with very long string', () => {
      const node = rendererMethods.createTextNode('short')
      const longText = 'y'.repeat(50000)
      rendererMethods.replaceText(node, longText)
      expect(node.props.value).toBe(longText)
    })

    test('replaceText preserves other props', () => {
      const node = rendererMethods.createTextNode('initial')
      node.props.customProp = 'preserved'
      rendererMethods.replaceText(node, 'updated')
      expect(node.props.value).toBe('updated')
      expect(node.props.customProp).toBe('preserved')
    })
  })

  describe('navigation methods edge cases', () => {
    test('getNextSibling with single child', () => {
      const parent = rendererMethods.createElement('parent')
      const only = rendererMethods.createElement('only')
      rendererMethods.insertNode(parent, only)
      expect(rendererMethods.getNextSibling(only)).toBeUndefined()
    })

    test('getNextSibling traversal through all siblings', () => {
      const parent = rendererMethods.createElement('parent')
      const children = ['a', 'b', 'c', 'd'].map(t => 
        rendererMethods.createElement(t)
      )
      children.forEach(c => rendererMethods.insertNode(parent, c))
      
      expect(rendererMethods.getNextSibling(children[0])).toBe(children[1])
      expect(rendererMethods.getNextSibling(children[1])).toBe(children[2])
      expect(rendererMethods.getNextSibling(children[2])).toBe(children[3])
      expect(rendererMethods.getNextSibling(children[3])).toBeUndefined()
    })

    test('getFirstChild with nested structure', () => {
      const root = rendererMethods.createElement('root')
      const first = rendererMethods.createElement('first')
      const nested = rendererMethods.createElement('nested')
      
      rendererMethods.insertNode(root, first)
      rendererMethods.insertNode(first, nested)
      
      expect(rendererMethods.getFirstChild(root)).toBe(first)
      expect(rendererMethods.getFirstChild(first)).toBe(nested)
      expect(rendererMethods.getFirstChild(nested)).toBeUndefined()
    })

    test('getParentNode chain to root', () => {
      const root = rendererMethods.createElement('root')
      const child = rendererMethods.createElement('child')
      const grandchild = rendererMethods.createElement('grandchild')
      
      rendererMethods.insertNode(root, child)
      rendererMethods.insertNode(child, grandchild)
      
      expect(rendererMethods.getParentNode(grandchild)).toBe(child)
      expect(rendererMethods.getParentNode(child)).toBe(root)
      expect(rendererMethods.getParentNode(root)).toBeUndefined()
    })
  })

  describe('isTextNode edge cases', () => {
    test('isTextNode with lowercase "text" type', () => {
      const node: SmithersNode = {
        type: 'text',
        props: {},
        children: [],
        parent: null
      }
      // 'text' is not the same as 'TEXT'
      expect(rendererMethods.isTextNode(node)).toBe(false)
    })

    test('isTextNode with exact TEXT type', () => {
      const node: SmithersNode = {
        type: 'TEXT',
        props: { value: 'test' },
        children: [],
        parent: null
      }
      expect(rendererMethods.isTextNode(node)).toBe(true)
    })
  })
})

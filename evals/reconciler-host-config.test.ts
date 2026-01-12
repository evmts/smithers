import { describe, it, expect, beforeEach } from 'bun:test'
import { hostConfig } from '@evmts/smithers/testing'
import type { SmithersNode } from '@evmts/smithers'

/**
 * Reconciler Host Config Unit Tests
 *
 * Tests the React reconciler host configuration for Smithers:
 * - Node creation (createInstance, createTextInstance)
 * - Tree manipulation (appendChild, insertBefore, removeChild)
 * - Updates (prepareUpdate, commitUpdate, commitTextUpdate)
 * - Container operations (appendChildToContainer, clearContainer)
 * - Lifecycle methods
 */
describe('hostConfig', () => {
  // Helper to create a root container node
  function createRootNode(): SmithersNode {
    return {
      type: 'ROOT',
      props: {},
      children: [],
      parent: null,
    }
  }

  describe('configuration flags', () => {
    it('supportsMutation is true', () => {
      expect(hostConfig.supportsMutation).toBe(true)
    })

    it('supportsPersistence is false', () => {
      expect(hostConfig.supportsPersistence).toBe(false)
    })

    it('supportsHydration is false', () => {
      expect(hostConfig.supportsHydration).toBe(false)
    })

    it('isPrimaryRenderer is true', () => {
      expect(hostConfig.isPrimaryRenderer).toBe(true)
    })

    it('supportsMicrotasks is false', () => {
      expect(hostConfig.supportsMicrotasks).toBe(false)
    })
  })

  describe('createInstance', () => {
    it('creates a node with correct type', () => {
      const root = createRootNode()
      const node = hostConfig.createInstance('claude', {}, root, {}, {})

      expect(node.type).toBe('claude')
    })

    it('creates a node with copied props', () => {
      const root = createRootNode()
      const props = { name: 'test', value: 123 }
      const node = hostConfig.createInstance('phase', props, root, {}, {})

      expect(node.props).toEqual({ name: 'test', value: 123 })
      // Ensure props are copied, not referenced
      expect(node.props).not.toBe(props)
    })

    it('creates a node with empty children array', () => {
      const root = createRootNode()
      const node = hostConfig.createInstance('step', {}, root, {}, {})

      expect(node.children).toEqual([])
    })

    it('creates a node with null parent', () => {
      const root = createRootNode()
      const node = hostConfig.createInstance('subagent', {}, root, {}, {})

      expect(node.parent).toBeNull()
    })

    it('works for all component types', () => {
      const root = createRootNode()
      const types = ['claude', 'subagent', 'phase', 'step', 'persona', 'constraints']

      for (const type of types) {
        const node = hostConfig.createInstance(type, {}, root, {}, {})
        expect(node.type).toBe(type)
      }
    })
  })

  describe('createTextInstance', () => {
    it('creates a TEXT node', () => {
      const root = createRootNode()
      const node = hostConfig.createTextInstance('Hello World', root, {}, {})

      expect(node.type).toBe('TEXT')
    })

    it('stores text content in props.value', () => {
      const root = createRootNode()
      const node = hostConfig.createTextInstance('Test content', root, {}, {})

      expect(node.props.value).toBe('Test content')
    })

    it('creates node with empty children', () => {
      const root = createRootNode()
      const node = hostConfig.createTextInstance('Text', root, {}, {})

      expect(node.children).toEqual([])
    })

    it('creates node with null parent', () => {
      const root = createRootNode()
      const node = hostConfig.createTextInstance('Text', root, {}, {})

      expect(node.parent).toBeNull()
    })

    it('handles empty string', () => {
      const root = createRootNode()
      const node = hostConfig.createTextInstance('', root, {}, {})

      expect(node.props.value).toBe('')
    })

    it('handles special characters', () => {
      const root = createRootNode()
      const text = '<script>alert("xss")</script>'
      const node = hostConfig.createTextInstance(text, root, {}, {})

      expect(node.props.value).toBe(text)
    })
  })

  describe('appendInitialChild', () => {
    it('adds child to parent children array', () => {
      const parent = createRootNode()
      const child: SmithersNode = {
        type: 'claude',
        props: {},
        children: [],
        parent: null,
      }

      hostConfig.appendInitialChild(parent, child)

      expect(parent.children).toContain(child)
      expect(parent.children.length).toBe(1)
    })

    it('sets parent reference on child', () => {
      const parent = createRootNode()
      const child: SmithersNode = {
        type: 'claude',
        props: {},
        children: [],
        parent: null,
      }

      hostConfig.appendInitialChild(parent, child)

      expect(child.parent).toBe(parent)
    })

    it('appends multiple children in order', () => {
      const parent = createRootNode()
      const child1: SmithersNode = { type: 'phase', props: { name: 'first' }, children: [], parent: null }
      const child2: SmithersNode = { type: 'phase', props: { name: 'second' }, children: [], parent: null }
      const child3: SmithersNode = { type: 'phase', props: { name: 'third' }, children: [], parent: null }

      hostConfig.appendInitialChild(parent, child1)
      hostConfig.appendInitialChild(parent, child2)
      hostConfig.appendInitialChild(parent, child3)

      expect(parent.children).toEqual([child1, child2, child3])
    })
  })

  describe('appendChild', () => {
    it('adds child to parent during updates', () => {
      const parent = createRootNode()
      const child: SmithersNode = {
        type: 'step',
        props: {},
        children: [],
        parent: null,
      }

      hostConfig.appendChild(parent, child)

      expect(parent.children).toContain(child)
      expect(child.parent).toBe(parent)
    })
  })

  describe('insertBefore', () => {
    it('inserts child before specified sibling', () => {
      const parent = createRootNode()
      const child1: SmithersNode = { type: 'phase', props: {}, children: [], parent: parent }
      const child2: SmithersNode = { type: 'phase', props: {}, children: [], parent: parent }
      const newChild: SmithersNode = { type: 'phase', props: {}, children: [], parent: null }

      parent.children = [child1, child2]

      hostConfig.insertBefore(parent, newChild, child2)

      expect(parent.children).toEqual([child1, newChild, child2])
      expect(newChild.parent).toBe(parent)
    })

    it('inserts at beginning when before first child', () => {
      const parent = createRootNode()
      const child1: SmithersNode = { type: 'phase', props: {}, children: [], parent: parent }
      const newChild: SmithersNode = { type: 'phase', props: {}, children: [], parent: null }

      parent.children = [child1]

      hostConfig.insertBefore(parent, newChild, child1)

      expect(parent.children).toEqual([newChild, child1])
    })

    it('appends if beforeChild not found', () => {
      const parent = createRootNode()
      const child1: SmithersNode = { type: 'phase', props: {}, children: [], parent: parent }
      const newChild: SmithersNode = { type: 'phase', props: {}, children: [], parent: null }
      const notInParent: SmithersNode = { type: 'phase', props: {}, children: [], parent: null }

      parent.children = [child1]

      hostConfig.insertBefore(parent, newChild, notInParent)

      expect(parent.children).toEqual([child1, newChild])
    })
  })

  describe('removeChild', () => {
    it('removes child from parent', () => {
      const parent = createRootNode()
      const child: SmithersNode = { type: 'claude', props: {}, children: [], parent: parent }

      parent.children = [child]

      hostConfig.removeChild(parent, child)

      expect(parent.children).toEqual([])
    })

    it('clears parent reference on removed child', () => {
      const parent = createRootNode()
      const child: SmithersNode = { type: 'claude', props: {}, children: [], parent: parent }

      parent.children = [child]

      hostConfig.removeChild(parent, child)

      expect(child.parent).toBeNull()
    })

    it('removes correct child from multiple children', () => {
      const parent = createRootNode()
      const child1: SmithersNode = { type: 'phase', props: { id: 1 }, children: [], parent: parent }
      const child2: SmithersNode = { type: 'phase', props: { id: 2 }, children: [], parent: parent }
      const child3: SmithersNode = { type: 'phase', props: { id: 3 }, children: [], parent: parent }

      parent.children = [child1, child2, child3]

      hostConfig.removeChild(parent, child2)

      expect(parent.children).toEqual([child1, child3])
    })

    it('does nothing if child not found', () => {
      const parent = createRootNode()
      const child1: SmithersNode = { type: 'phase', props: {}, children: [], parent: parent }
      const notChild: SmithersNode = { type: 'phase', props: {}, children: [], parent: null }

      parent.children = [child1]

      hostConfig.removeChild(parent, notChild)

      expect(parent.children).toEqual([child1])
    })
  })

  describe('removeChildFromContainer', () => {
    it('removes child from container', () => {
      const container = createRootNode()
      const child: SmithersNode = { type: 'claude', props: {}, children: [], parent: container }

      container.children = [child]

      hostConfig.removeChildFromContainer(container, child)

      expect(container.children).toEqual([])
      expect(child.parent).toBeNull()
    })
  })

  describe('prepareUpdate', () => {
    let root: SmithersNode

    beforeEach(() => {
      root = createRootNode()
    })

    it('returns null when props are identical', () => {
      const instance: SmithersNode = { type: 'claude', props: { name: 'test' }, children: [], parent: null }

      const result = hostConfig.prepareUpdate(
        instance,
        'claude',
        { name: 'test' },
        { name: 'test' },
        root,
        {}
      )

      expect(result).toBeNull()
    })

    it('returns new props when props changed', () => {
      const instance: SmithersNode = { type: 'claude', props: { name: 'old' }, children: [], parent: null }

      const result = hostConfig.prepareUpdate(
        instance,
        'claude',
        { name: 'old' },
        { name: 'new' },
        root,
        {}
      )

      expect(result).toEqual({ name: 'new' })
    })

    it('detects changed when key count differs', () => {
      const instance: SmithersNode = { type: 'claude', props: { a: 1 }, children: [], parent: null }

      const result = hostConfig.prepareUpdate(
        instance,
        'claude',
        { a: 1 },
        { a: 1, b: 2 },
        root,
        {}
      )

      expect(result).toEqual({ a: 1, b: 2 })
    })

    it('handles empty props', () => {
      const instance: SmithersNode = { type: 'claude', props: {}, children: [], parent: null }

      const result = hostConfig.prepareUpdate(
        instance,
        'claude',
        {},
        {},
        root,
        {}
      )

      expect(result).toBeNull()
    })

    it('extracts pendingProps from fiber object (React 19 workaround)', () => {
      const instance: SmithersNode = { type: 'claude', props: { name: 'old' }, children: [], parent: null }

      // Simulate React 19 passing fiber as newProps
      const fiberLikeObject = {
        pendingProps: { name: 'new' },
        otherFiberStuff: true,
      }

      const result = hostConfig.prepareUpdate(
        instance,
        'claude',
        { name: 'old' },
        fiberLikeObject as any,
        root,
        {}
      )

      expect(result).toEqual({ name: 'new' })
    })
  })

  describe('commitUpdate', () => {
    it('updates instance props', () => {
      const instance: SmithersNode = { type: 'claude', props: { name: 'old' }, children: [], parent: null }

      hostConfig.commitUpdate(
        instance,
        { name: 'new' },
        'claude',
        { name: 'old' },
        { name: 'new' },
        {}
      )

      expect(instance.props).toEqual({ name: 'new' })
    })

    it('extracts pendingProps from fiber object (React 19 workaround)', () => {
      const instance: SmithersNode = { type: 'claude', props: { name: 'old' }, children: [], parent: null }

      // Simulate React 19 passing fiber as nextProps
      const fiberLikeObject = {
        pendingProps: { name: 'extracted' },
        otherFiberStuff: true,
      }

      hostConfig.commitUpdate(
        instance,
        { name: 'extracted' },
        'claude',
        { name: 'old' },
        fiberLikeObject as any,
        {}
      )

      expect(instance.props).toEqual({ name: 'extracted' })
    })

    it('copies props instead of referencing', () => {
      const instance: SmithersNode = { type: 'claude', props: {}, children: [], parent: null }
      const updatePayload = { name: 'test' }

      hostConfig.commitUpdate(
        instance,
        updatePayload,
        'claude',
        {},
        { name: 'test' },
        {}
      )

      // Modify the original
      updatePayload.name = 'modified'

      // Instance should not be affected
      expect(instance.props.name).toBe('test')
    })
  })

  describe('commitTextUpdate', () => {
    it('updates text content', () => {
      const textNode: SmithersNode = {
        type: 'TEXT',
        props: { value: 'old text' },
        children: [],
        parent: null,
      }

      hostConfig.commitTextUpdate(textNode, 'old text', 'new text')

      expect(textNode.props.value).toBe('new text')
    })

    it('handles empty string', () => {
      const textNode: SmithersNode = {
        type: 'TEXT',
        props: { value: 'some text' },
        children: [],
        parent: null,
      }

      hostConfig.commitTextUpdate(textNode, 'some text', '')

      expect(textNode.props.value).toBe('')
    })
  })

  describe('container operations', () => {
    describe('appendChildToContainer', () => {
      it('appends child to container', () => {
        const container = createRootNode()
        const child: SmithersNode = { type: 'claude', props: {}, children: [], parent: null }

        hostConfig.appendChildToContainer(container, child)

        expect(container.children).toContain(child)
        expect(child.parent).toBe(container)
      })
    })

    describe('insertInContainerBefore', () => {
      it('inserts child before sibling in container', () => {
        const container = createRootNode()
        const child1: SmithersNode = { type: 'phase', props: {}, children: [], parent: container }
        const newChild: SmithersNode = { type: 'phase', props: {}, children: [], parent: null }

        container.children = [child1]

        hostConfig.insertInContainerBefore(container, newChild, child1)

        expect(container.children).toEqual([newChild, child1])
        expect(newChild.parent).toBe(container)
      })

      it('appends if beforeChild not found', () => {
        const container = createRootNode()
        const child1: SmithersNode = { type: 'phase', props: {}, children: [], parent: container }
        const newChild: SmithersNode = { type: 'phase', props: {}, children: [], parent: null }
        const notInContainer: SmithersNode = { type: 'phase', props: {}, children: [], parent: null }

        container.children = [child1]

        hostConfig.insertInContainerBefore(container, newChild, notInContainer)

        expect(container.children).toEqual([child1, newChild])
      })
    })

    describe('clearContainer', () => {
      it('removes all children from container', () => {
        const container = createRootNode()
        container.children = [
          { type: 'phase', props: {}, children: [], parent: container },
          { type: 'phase', props: {}, children: [], parent: container },
          { type: 'phase', props: {}, children: [], parent: container },
        ]

        hostConfig.clearContainer(container)

        expect(container.children).toEqual([])
      })

      it('handles empty container', () => {
        const container = createRootNode()

        hostConfig.clearContainer(container)

        expect(container.children).toEqual([])
      })
    })
  })

  describe('lifecycle methods', () => {
    it('finalizeInitialChildren returns false', () => {
      const root = createRootNode()
      const instance: SmithersNode = { type: 'claude', props: {}, children: [], parent: null }

      const result = hostConfig.finalizeInitialChildren(instance, 'claude', {}, root, {})

      expect(result).toBe(false)
    })

    it('prepareForCommit returns null', () => {
      const container = createRootNode()

      const result = hostConfig.prepareForCommit(container)

      expect(result).toBeNull()
    })

    it('resetAfterCommit does not throw', () => {
      const container = createRootNode()

      expect(() => hostConfig.resetAfterCommit(container)).not.toThrow()
    })

    it('getRootHostContext returns empty object', () => {
      const root = createRootNode()

      const result = hostConfig.getRootHostContext(root)

      expect(result).toEqual({})
    })

    it('getChildHostContext returns parent context', () => {
      const root = createRootNode()
      const parentContext = { key: 'value' }

      const result = hostConfig.getChildHostContext(parentContext, 'claude', root)

      expect(result).toBe(parentContext)
    })
  })

  describe('utility methods', () => {
    it('shouldSetTextContent returns false', () => {
      const result = hostConfig.shouldSetTextContent('claude', {})

      expect(result).toBe(false)
    })

    it('getPublicInstance returns the instance', () => {
      const instance: SmithersNode = { type: 'claude', props: {}, children: [], parent: null }

      const result = hostConfig.getPublicInstance(instance)

      expect(result).toBe(instance)
    })

    it('getCurrentEventPriority returns 0', () => {
      expect(hostConfig.getCurrentEventPriority()).toBe(0)
    })

    it('resolveUpdatePriority returns 0', () => {
      expect(hostConfig.resolveUpdatePriority()).toBe(0)
    })

    it('now returns current timestamp', () => {
      const before = Date.now()
      const result = hostConfig.now()
      const after = Date.now()

      expect(result).toBeGreaterThanOrEqual(before)
      expect(result).toBeLessThanOrEqual(after)
    })
  })

  describe('scheduling', () => {
    it('scheduleTimeout works like setTimeout', async () => {
      let called = false
      hostConfig.scheduleTimeout(() => {
        called = true
      }, 10)

      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(called).toBe(true)
    })

    it('cancelTimeout works like clearTimeout', async () => {
      let called = false
      const id = hostConfig.scheduleTimeout(() => {
        called = true
      }, 100)

      hostConfig.cancelTimeout(id)

      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(called).toBe(false)
    })

    it('noTimeout is -1', () => {
      expect(hostConfig.noTimeout).toBe(-1)
    })
  })

  describe('visibility (no-op methods)', () => {
    it('hideInstance does not throw', () => {
      const instance: SmithersNode = { type: 'claude', props: {}, children: [], parent: null }
      expect(() => hostConfig.hideInstance(instance)).not.toThrow()
    })

    it('unhideInstance does not throw', () => {
      const instance: SmithersNode = { type: 'claude', props: {}, children: [], parent: null }
      expect(() => hostConfig.unhideInstance(instance, {})).not.toThrow()
    })

    it('hideTextInstance does not throw', () => {
      const textInstance: SmithersNode = { type: 'TEXT', props: { value: 'text' }, children: [], parent: null }
      expect(() => hostConfig.hideTextInstance(textInstance)).not.toThrow()
    })

    it('unhideTextInstance does not throw', () => {
      const textInstance: SmithersNode = { type: 'TEXT', props: { value: 'text' }, children: [], parent: null }
      expect(() => hostConfig.unhideTextInstance(textInstance, 'text')).not.toThrow()
    })

    it('detachDeletedInstance does not throw', () => {
      const instance: SmithersNode = { type: 'claude', props: {}, children: [], parent: null }
      expect(() => hostConfig.detachDeletedInstance(instance)).not.toThrow()
    })
  })
})

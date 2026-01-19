/**
 * Unit tests for jsx-runtime.ts - Custom JSX runtime for Smithers.
 * Tests the key propagation and React delegation behavior.
 */
import { describe, test, expect } from 'bun:test'
import { jsx, jsxs, jsxDEV, Fragment } from './jsx-runtime.js'
import { createSmithersRoot } from './root.js'

describe('jsx-runtime', () => {
  describe('jsx', () => {
    test('creates React element with type', async () => {
      const root = createSmithersRoot()
      const element = jsx('phase', { name: 'test' })
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.type).toBe('phase')
      root.dispose()
    })

    test('passes props through', async () => {
      const root = createSmithersRoot()
      const element = jsx('step', { count: 42, enabled: true })
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.props.count).toBe(42)
      expect(tree.children[0]!.props.enabled).toBe(true)
      root.dispose()
    })

    test('injects __smithersKey from key parameter', async () => {
      const root = createSmithersRoot()
      const element = jsx('task', { name: 'test' }, 'my-key')
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.key).toBe('my-key')
      root.dispose()
    })

    test('handles null props', async () => {
      const root = createSmithersRoot()
      // jsx with null props should create element with empty props object
      const element = jsx('div', {})
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.type).toBe('div')
      root.dispose()
    })

    test('handles undefined key', async () => {
      const root = createSmithersRoot()
      const element = jsx('span', { id: 'test' }, undefined)
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.key).toBeUndefined()
      root.dispose()
    })
  })

  describe('jsxs', () => {
    test('handles multiple children', async () => {
      const root = createSmithersRoot()
      const element = jsxs('phase', {
        children: [
          jsx('step', { key: '1' }, '1'),
          jsx('step', { key: '2' }, '2'),
        ]
      })
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.children).toHaveLength(2)
      root.dispose()
    })

    test('injects __smithersKey from key parameter', async () => {
      const root = createSmithersRoot()
      const element = jsxs('container', { children: [] }, 'container-key')
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.key).toBe('container-key')
      root.dispose()
    })
  })

  describe('jsxDEV', () => {
    test('works like jsx with source info', async () => {
      const root = createSmithersRoot()
      const element = jsxDEV(
        'phase',
        { name: 'dev-test' },
        'dev-key',
        false,
        { fileName: 'test.tsx', lineNumber: 10, columnNumber: 5 },
        null
      )
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.type).toBe('phase')
      expect(tree.children[0]!.props.name).toBe('dev-test')
      expect(tree.children[0]!.key).toBe('dev-key')
      root.dispose()
    })

    test('handles static children flag', async () => {
      const root = createSmithersRoot()
      const element = jsxDEV(
        'wrapper',
        { children: jsx('child', {}) },
        undefined,
        true,
        undefined,
        null
      )
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.type).toBe('wrapper')
      root.dispose()
    })
  })

  describe('Fragment', () => {
    test('Fragment is exported', () => {
      expect(Fragment).toBeDefined()
    })

    test('Fragment flattens children', async () => {
      const root = createSmithersRoot()
      await root.render(
        jsxs('parent', {
          children: jsx(Fragment, {
            children: jsxs(Fragment, {
              children: [
                jsx('a', {}, 'a'),
                jsx('b', {}, 'b'),
              ]
            })
          })
        })
      )
      
      const tree = root.getTree()
      const parent = tree.children[0]!
      expect(parent.children).toHaveLength(2)
      expect(parent.children[0]!.type).toBe('a')
      expect(parent.children[1]!.type).toBe('b')
      root.dispose()
    })
  })

  describe('withSmithersKey (internal)', () => {
    test('preserves existing props when adding key', async () => {
      const root = createSmithersRoot()
      const element = jsx('node', { a: 1, b: 2 }, 'key')
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.props.a).toBe(1)
      expect(tree.children[0]!.props.b).toBe(2)
      expect(tree.children[0]!.key).toBe('key')
      root.dispose()
    })

    test('handles numeric key', async () => {
      const root = createSmithersRoot()
      const element = jsx('item', {}, 123)
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.key).toBe(123)
      root.dispose()
    })
  })
})

describe('jsx-runtime - Missing Coverage', () => {
  describe('jsx element types', () => {
    test('jsx with function component type', async () => {
      const FnComp = (props: { value: number }) => jsx('step', { result: props.value })
      const root = createSmithersRoot()
      await root.render(jsx(FnComp, { value: 42 }))
      
      const tree = root.getTree()
      expect(tree.children[0]!.type).toBe('step')
      expect(tree.children[0]!.props.result).toBe(42)
      root.dispose()
    })

    test('jsx with class component type', async () => {
      const { Component } = await import('react')
      class ClassComp extends Component<{ label: string }> {
        render() {
          return jsx('phase', { name: this.props.label })
        }
      }
      const root = createSmithersRoot()
      await root.render(jsx(ClassComp, { label: 'class-test' }))
      
      const tree = root.getTree()
      expect(tree.children[0]!.type).toBe('phase')
      expect(tree.children[0]!.props.name).toBe('class-test')
      root.dispose()
    })

    test('jsx with memo wrapped component', async () => {
      const { memo } = await import('react')
      const Inner = (props: { x: number }) => jsx('task', { num: props.x })
      const MemoComp = memo(Inner)
      const root = createSmithersRoot()
      await root.render(jsx(MemoComp, { x: 99 }))
      
      const tree = root.getTree()
      expect(tree.children[0]!.type).toBe('task')
      expect(tree.children[0]!.props.num).toBe(99)
      root.dispose()
    })

    test('jsx with forwardRef component', async () => {
      const { forwardRef } = await import('react')
      const FwdComp = forwardRef<unknown, { msg: string }>((props, _ref) => 
        jsx('step', { text: props.msg })
      )
      const root = createSmithersRoot()
      await root.render(jsx(FwdComp, { msg: 'forwarded' }))
      
      const tree = root.getTree()
      expect(tree.children[0]!.type).toBe('step')
      expect(tree.children[0]!.props.text).toBe('forwarded')
      root.dispose()
    })

    test('jsx with lazy component renders Suspense fallback', async () => {
      const { lazy, Suspense } = await import('react')
      const LazyComp = lazy(() => new Promise(() => {}))
      
      const root = createSmithersRoot()
      await root.render(jsx(Suspense, { 
        fallback: jsx('phase', { name: 'loading' }),
        children: jsx(LazyComp, {})
      }))
      
      const tree = root.getTree()
      const findNode = (node: typeof tree, type: string): typeof tree | undefined => {
        if (node.type === type) return node
        for (const child of node.children || []) {
          const found = findNode(child, type)
          if (found) return found
        }
        return undefined
      }
      const phaseNode = findNode(tree, 'phase')
      expect(phaseNode?.props.name).toBe('loading')
      root.dispose()
    })

    test('jsx with context provider type', async () => {
      const { createContext } = await import('react')
      const Ctx = createContext('default')
      const root = createSmithersRoot()
      await root.render(
        jsx(Ctx.Provider, { value: 'provided', children: jsx('step', {}) })
      )
      
      const tree = root.getTree()
      expect(tree.children[0]!.type).toBe('step')
      root.dispose()
    })

    test('jsx with context consumer type', async () => {
      const { createContext, useContext } = await import('react')
      const Ctx = createContext('ctx-value')
      const Consumer = () => {
        const val = useContext(Ctx)
        return jsx('task', { result: val })
      }
      const root = createSmithersRoot()
      await root.render(
        jsx(Ctx.Provider, { 
          value: 'consumed',
          children: jsx(Consumer, {})
        })
      )
      
      const tree = root.getTree()
      const findNode = (node: typeof tree, type: string): typeof tree | undefined => {
        if (node.type === type) return node
        for (const child of node.children || []) {
          const found = findNode(child, type)
          if (found) return found
        }
        return undefined
      }
      const taskNode = findNode(tree, 'task')
      expect(taskNode?.props.result).toBe('consumed')
      root.dispose()
    })
  })

  describe('key edge cases', () => {
    test('key with special characters', async () => {
      const root = createSmithersRoot()
      const element = jsx('step', {}, 'key/with:special$chars!@#')
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.key).toBe('key/with:special$chars!@#')
      root.dispose()
    })

    test('key that is 0 (falsy but valid)', async () => {
      const root = createSmithersRoot()
      const element = jsx('step', {}, 0)
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.key).toBe(0)
      root.dispose()
    })

    test('key that is empty string', async () => {
      const root = createSmithersRoot()
      const element = jsx('step', {}, '')
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.key).toBe('')
      root.dispose()
    })

    test('key that is NaN', async () => {
      const root = createSmithersRoot()
      const element = jsx('step', {}, NaN)
      await root.render(element)
      
      const tree = root.getTree()
      expect(Number.isNaN(tree.children[0]!.key)).toBe(true)
      root.dispose()
    })

    test('key collision handling', async () => {
      const root = createSmithersRoot()
      await root.render(
        jsxs('parent', {
          children: [
            jsx('step', { id: 'first' }, 'same-key'),
            jsx('step', { id: 'second' }, 'same-key'),
          ]
        })
      )
      
      const tree = root.getTree()
      const parent = tree.children[0]!
      expect(parent.children).toHaveLength(2)
      expect(parent.children[0]!.key).toBe('same-key')
      expect(parent.children[1]!.key).toBe('same-key')
      expect(parent.children[0]!.props.id).toBe('first')
      expect(parent.children[1]!.props.id).toBe('second')
      root.dispose()
    })
  })

  describe('props edge cases', () => {
    test('props with ref', async () => {
      const { createRef } = await import('react')
      const ref = createRef<unknown>()
      const root = createSmithersRoot()
      await root.render(jsx('step', { ref }))
      
      const tree = root.getTree()
      expect(tree.children[0]!.type).toBe('step')
      root.dispose()
    })

    test('props with dangerouslySetInnerHTML', async () => {
      const root = createSmithersRoot()
      await root.render(jsx('step', { 
        dangerouslySetInnerHTML: { __html: '<b>bold</b>' } 
      }))
      
      const tree = root.getTree()
      expect(tree.children[0]!.props.dangerouslySetInnerHTML).toEqual({ __html: '<b>bold</b>' })
      root.dispose()
    })

    test('props with style object', async () => {
      const root = createSmithersRoot()
      const style = { color: 'red', fontSize: 14 }
      await root.render(jsx('step', { style }))
      
      const tree = root.getTree()
      expect(tree.children[0]!.props.style).toEqual({ color: 'red', fontSize: 14 })
      root.dispose()
    })

    test('props with event handlers', async () => {
      const root = createSmithersRoot()
      const onClick = () => {}
      const onHover = () => {}
      await root.render(jsx('step', { onClick, onHover }))
      
      const tree = root.getTree()
      expect(typeof tree.children[0]!.props.onClick).toBe('function')
      expect(typeof tree.children[0]!.props.onHover).toBe('function')
      root.dispose()
    })

    test('props spread behavior', async () => {
      const root = createSmithersRoot()
      const baseProps = { a: 1, b: 2 }
      const overrides = { b: 3, c: 4 }
      await root.render(jsx('step', { ...baseProps, ...overrides }))
      
      const tree = root.getTree()
      expect(tree.children[0]!.props.a).toBe(1)
      expect(tree.children[0]!.props.b).toBe(3)
      expect(tree.children[0]!.props.c).toBe(4)
      root.dispose()
    })
  })

  describe('type coercion', () => {
    test('jsx casts ElementType correctly', () => {
      const FnComp = () => jsx('step', {})
      const element = jsx(FnComp, {})
      expect(element.type).toBe(FnComp)
    })

    test('jsxs casts ElementType correctly', () => {
      const FnComp = () => jsxs('step', { children: [] })
      const element = jsxs(FnComp, { children: [] })
      expect(element.type).toBe(FnComp)
    })

    test('jsxDEV casts ElementType correctly', () => {
      const FnComp = () => jsx('step', {})
      const element = jsxDEV(FnComp, {}, undefined, false, undefined, null)
      expect(element.type).toBe(FnComp)
    })
  })

  describe('integration with reconciler', () => {
    test('jsx output compatible with SmithersReconciler', async () => {
      const root = createSmithersRoot()
      const element = jsx('phase', {
        children: jsxs('step', {
          children: [
            jsx('task', { id: 1 }, '1'),
            jsx('task', { id: 2 }, '2'),
          ]
        })
      })
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.type).toBe('phase')
      expect(tree.children[0]!.children[0]!.type).toBe('step')
      expect(tree.children[0]!.children[0]!.children).toHaveLength(2)
      root.dispose()
    })

    test('key from jsx-runtime survives reconciliation', async () => {
      const root = createSmithersRoot()
      await root.render(jsx('step', { value: 1 }, 'persistent-key'))
      
      let tree = root.getTree()
      expect(tree.children[0]!.key).toBe('persistent-key')
      
      await root.render(jsx('step', { value: 2 }, 'persistent-key'))
      tree = root.getTree()
      expect(tree.children[0]!.key).toBe('persistent-key')
      expect(tree.children[0]!.props.value).toBe(2)
      root.dispose()
    })

    test('__smithersKey prop is set on instance', async () => {
      const root = createSmithersRoot()
      const element = jsx('step', { custom: 'prop' }, 'my-smithers-key')
      
      expect(element.props.__smithersKey).toBe('my-smithers-key')
      
      await root.render(element)
      const tree = root.getTree()
      expect(tree.children[0]!.key).toBe('my-smithers-key')
      root.dispose()
    })
  })
})

import { describe, test, expect } from 'bun:test'
import * as coreModule from './index.js'
import { serialize } from './index.js'
import { serialize as reconcilerSerialize } from '../reconciler/serialize.js'
import type { SmithersNode, ExecutionState, ExecuteOptions, ExecutionResult, DebugOptions, DebugEvent } from './index.js'

describe('core/index', () => {
  describe('module exports', () => {
    test('exports serialize function from reconciler', () => {
      expect(coreModule.serialize).toBeDefined()
      expect(coreModule.serialize).toBe(reconcilerSerialize)
    })

    test('serialize export is a function', () => {
      expect(typeof serialize).toBe('function')
    })

    test('type exports compile (SmithersNode, ExecutionState, etc.)', () => {
const node: SmithersNode = {
        type: 'task',
        props: { name: 'test' },
        children: [],
        key: undefined,
        parent: null,
      }
      const state: ExecutionState = 'pending'
      const options: ExecuteOptions = {}
      const result: ExecutionResult = { success: true }
      const debugOpts: DebugOptions = { enabled: false }
      const event: DebugEvent = { type: 'start', timestamp: Date.now() }
      
      expect(node.type).toBe('task')
      expect(state).toBe('pending')
      expect(options).toEqual({})
      expect(result.success).toBe(true)
      expect(debugOpts.enabled).toBe(false)
      expect(event.type).toBe('start')
    })
  })

  describe('serialize re-export', () => {
    test('serialize works correctly when imported from core', () => {
      const node: SmithersNode = {
        type: 'task',
        props: { name: 'test-task' },
        children: [],
        key: undefined,
        parent: null,
      }
      const result = serialize(node)
      expect(result).toContain('<task')
      expect(result).toContain('name="test-task"')
      expect(result).toMatch(/<\/task>|\/>/)
    })

    test('serialize handles SmithersNode with children', () => {
      const child: SmithersNode = {
        type: 'TEXT',
        props: { value: 'hello' },
        children: [],
        key: undefined,
        parent: null,
      }
      const node: SmithersNode = {
        type: 'step',
        props: { name: 'step1' },
        children: [child],
        key: undefined,
        parent: null,
      }
      child.parent = node
      const result = serialize(node)
      expect(result).toContain('<step')
      expect(result).toContain('hello')
    })

    test('serialize returns string output', () => {
      const node: SmithersNode = {
        type: 'ROOT',
        props: {},
        children: [],
        key: undefined,
        parent: null,
      }
      const result = serialize(node)
      expect(typeof result).toBe('string')
    })
  })

  describe('backwards compatibility', () => {
    test('importing from core/index gives same result as reconciler/serialize', () => {
      const node: SmithersNode = {
        type: 'claude',
        props: { model: 'claude-3' },
        children: [
          {
            type: 'TEXT',
            props: { value: 'Hello world' },
            children: [],
            key: undefined,
            parent: null,
          }
        ],
        key: undefined,
        parent: null,
      }
      node.children[0].parent = node
      
      const coreResult = serialize(node)
      const reconcilerResult = reconcilerSerialize(node)
      expect(coreResult).toBe(reconcilerResult)
    })

    test('all documented exports are present', () => {
      const exports = Object.keys(coreModule)
      expect(exports).toContain('serialize')
expect(exports.length).toBe(1)
    })
  })
})

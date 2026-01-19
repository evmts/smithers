/**
 * Tests for src/core/index.ts
 * The core module is currently a thin re-export layer
 */

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

    test('type exports are accessible (SmithersNode, ExecutionState, etc.)', () => {
      // Type-level test: if this compiles, types are exported correctly
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
      
      // Runtime assertions to use the variables
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
      expect(result).toBe('<task name="test-task" />')
    })

    test('serialize handles SmithersNode input', () => {
      const node: SmithersNode = {
        type: 'phase',
        props: { id: 'phase-1' },
        children: [
          {
            type: 'step',
            props: { order: 1 },
            children: [],
            key: undefined,
            parent: null,
          }
        ],
        key: undefined,
        parent: null,
      }
      // Set parent reference
      node.children[0].parent = node
      
      const result = serialize(node)
      expect(result).toContain('<phase')
      expect(result).toContain('<step')
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
      // Verify all exports from core/index.ts are present
      const exports = Object.keys(coreModule)
      
      // serialize is the only runtime export
      expect(exports).toContain('serialize')
      
      // Type exports don't appear at runtime, but we verified them in the type test above
      // This test ensures the module doesn't accidentally export extra things
      expect(exports.length).toBe(1)
    })
  })
})

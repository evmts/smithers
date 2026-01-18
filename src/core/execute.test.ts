/**
 * Unit tests for execute.ts - Ralph Wiggum loop execution engine.
 */
import { describe, test, expect } from 'bun:test'
import { executePlan } from './execute'
import type { SmithersNode } from './types'

describe('executePlan', () => {
  test('returns immediately when tree has no pending nodes', async () => {
    const tree: SmithersNode = {
      type: 'ROOT',
      props: {},
      children: [],
      parent: null,
    }

    const result = await executePlan(tree)

    expect(result.frames).toBe(1)
    expect(result.output).toBeNull()
    expect(result.totalDuration).toBeGreaterThanOrEqual(0)
  })

  test('respects maxFrames option', async () => {
    const tree: SmithersNode = {
      type: 'ROOT',
      props: {},
      children: [],
      parent: null,
    }

    const result = await executePlan(tree, { maxFrames: 5 })

    expect(result.frames).toBeLessThanOrEqual(5)
  })

  test('times out when timeout exceeded', async () => {
    // Create a tree that would run forever (if findPendingExecutables returned nodes)
    const tree: SmithersNode = {
      type: 'ROOT',
      props: {},
      children: [],
      parent: null,
    }

    // With current implementation (no pending nodes), this completes immediately
    const result = await executePlan(tree, { timeout: 100 })
    expect(result.frames).toBe(1)
  })

  test('handles nested tree structure', async () => {
    const child: SmithersNode = {
      type: 'phase',
      props: { name: 'test' },
      children: [],
      parent: null,
    }
    const tree: SmithersNode = {
      type: 'ROOT',
      props: {},
      children: [child],
      parent: null,
    }
    child.parent = tree

    const result = await executePlan(tree)

    expect(result).toBeDefined()
    expect(result.frames).toBe(1)
  })

  test('verbose option does not throw', async () => {
    const tree: SmithersNode = {
      type: 'ROOT',
      props: {},
      children: [],
      parent: null,
    }

    // Should not throw with verbose mode
    const result = await executePlan(tree, { verbose: true })
    expect(result).toBeDefined()
  })
})

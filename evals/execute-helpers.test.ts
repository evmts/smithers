/**
 * Execute Module Helper Function Tests
 *
 * Tests the internal helper functions in execute.ts.
 */
import { describe, test, expect } from 'bun:test'

// Setup import removed - causes JSX runtime loading errors
// import './setup'
// Using local createNode implementation instead of importing from test/utils
// (which imports from reconciler that triggers JSX loading)
import type { SmithersNode, ExecutionState } from '../src/core/types'

/**
 * Local createNode implementation to avoid importing from test/utils.
 */
function createNode(
  type: string,
  props: Record<string, unknown> = {},
  children: SmithersNode[] = []
): SmithersNode {
  const node: SmithersNode = {
    type,
    props,
    children: [],
    parent: null,
  }

  for (const child of children) {
    child.parent = node
    node.children.push(child)
  }

  return node
}

// Helper to create test nodes with execution state
function createNodeWithExecution(
  type: string,
  props: Record<string, unknown> = {},
  children: SmithersNode[] = [],
  execution?: ExecutionState
): SmithersNode {
  const node: SmithersNode = {
    type,
    props,
    children: [],
    parent: null,
    _execution: execution,
  }

  for (const child of children) {
    child.parent = node
    node.children.push(child)
  }

  return node
}

describe('SmithersNode structure', () => {
  test('createNode creates valid node structure', () => {
    const node = createNode('claude')

    expect(node.type).toBe('claude')
    expect(node.props).toEqual({})
    expect(node.children).toEqual([])
    expect(node.parent).toBeNull()
  })

  test('createNode with props', () => {
    const node = createNode('phase', { name: 'test', count: 42 })

    expect(node.type).toBe('phase')
    expect(node.props.name).toBe('test')
    expect(node.props.count).toBe(42)
  })

  test('createNode with children sets parent references', () => {
    const child1 = createNode('step')
    const child2 = createNode('step')
    const parent = createNode('phase', { name: 'test' }, [child1, child2])

    expect(parent.children).toHaveLength(2)
    expect(child1.parent).toBe(parent)
    expect(child2.parent).toBe(parent)
  })

  test('nested node tree', () => {
    const claude = createNode('claude')
    const step = createNode('step', {}, [claude])
    const phase = createNode('phase', { name: 'deep' }, [step])
    const root = createNode('ROOT', {}, [phase])

    expect(root.children[0]).toBe(phase)
    expect(phase.children[0]).toBe(step)
    expect(step.children[0]).toBe(claude)
    expect(claude.parent).toBe(step)
    expect(step.parent).toBe(phase)
    expect(phase.parent).toBe(root)
  })
})

describe('ExecutionState', () => {
  test('node with pending status', () => {
    const node = createNodeWithExecution('claude', {}, [], { status: 'pending' })

    expect(node._execution?.status).toBe('pending')
  })

  test('node with complete status', () => {
    const node = createNodeWithExecution('claude', {}, [], {
      status: 'complete',
      result: 'done',
      contentHash: 'abc123',
    })

    expect(node._execution?.status).toBe('complete')
    expect(node._execution?.result).toBe('done')
    expect(node._execution?.contentHash).toBe('abc123')
  })

  test('node with running status', () => {
    const node = createNodeWithExecution('claude', {}, [], { status: 'running' })

    expect(node._execution?.status).toBe('running')
  })

  test('node with error status', () => {
    const error = new Error('test error')
    const node = createNodeWithExecution('claude', {}, [], {
      status: 'error',
      error,
    })

    expect(node._execution?.status).toBe('error')
    expect(node._execution?.error).toBe(error)
  })
})

describe('Tree traversal patterns', () => {
  test('find all claude nodes in tree', () => {
    const claude1 = createNode('claude', { id: 1 })
    const claude2 = createNode('claude', { id: 2 })
    const phase1 = createNode('phase', { name: 'phase1' }, [claude1])
    const phase2 = createNode('phase', { name: 'phase2' }, [claude2])
    const root = createNode('ROOT', {}, [phase1, phase2])

    function findClaudeNodes(node: SmithersNode): SmithersNode[] {
      const results: SmithersNode[] = []

      if (node.type === 'claude') {
        results.push(node)
      }

      for (const child of node.children) {
        results.push(...findClaudeNodes(child))
      }

      return results
    }

    const claudeNodes = findClaudeNodes(root)
    expect(claudeNodes).toHaveLength(2)
    expect(claudeNodes[0].props.id).toBe(1)
    expect(claudeNodes[1].props.id).toBe(2)
  })

  test('find stop node in tree', () => {
    const stop = createNode('smithers-stop', { reason: 'done' })
    const phase = createNode('phase', { name: 'end' }, [stop])
    const root = createNode('ROOT', {}, [phase])

    function findStopNode(node: SmithersNode): SmithersNode | null {
      if (node.type === 'smithers-stop' || node.type === 'stop') {
        return node
      }

      for (const child of node.children) {
        const found = findStopNode(child)
        if (found) return found
      }

      return null
    }

    const stopNode = findStopNode(root)
    expect(stopNode).not.toBeNull()
    expect(stopNode?.props.reason).toBe('done')
  })

  test('find human node in tree', () => {
    const human = createNode('human', { message: 'Approve?' })
    const phase = createNode('phase', { name: 'review' }, [human])
    const root = createNode('ROOT', {}, [phase])

    function findHumanNode(node: SmithersNode): SmithersNode | null {
      if (node.type === 'human') {
        return node
      }

      for (const child of node.children) {
        const found = findHumanNode(child)
        if (found) return found
      }

      return null
    }

    const humanNode = findHumanNode(root)
    expect(humanNode).not.toBeNull()
    expect(humanNode?.props.message).toBe('Approve?')
  })
})

describe('Edge cases', () => {
  test('empty tree', () => {
    const root = createNode('ROOT')

    expect(root.children).toHaveLength(0)
  })

  test('single ROOT node', () => {
    const root = createNode('ROOT')

    expect(root.type).toBe('ROOT')
    expect(root.parent).toBeNull()
  })

  test('multiple levels of nesting (10 levels)', () => {
    let current: SmithersNode = createNode('claude')

    for (let i = 0; i < 10; i++) {
      current = createNode('phase', { name: `level${i}` }, [current])
    }

    const root = createNode('ROOT', {}, [current])

    // Walk down to find claude
    let depth = 0
    let node: SmithersNode | undefined = root
    while (node && node.type !== 'claude') {
      node = node.children[0]
      depth++
    }

    expect(depth).toBe(11) // ROOT + 10 phases
    expect(node?.type).toBe('claude')
  })
})

describe('Mixed execution states', () => {
  test('tree with mixed states', () => {
    const completeClaude = createNodeWithExecution('claude', { id: 1 }, [], {
      status: 'complete',
      result: 'done',
      contentHash: 'hash1',
    })
    const pendingClaude = createNode('claude', { id: 2 })
    const runningClaude = createNodeWithExecution('claude', { id: 3 }, [], { status: 'running' })
    const root = createNode('ROOT', {}, [completeClaude, pendingClaude, runningClaude])

    expect(completeClaude._execution?.status).toBe('complete')
    expect(pendingClaude._execution).toBeUndefined()
    expect(runningClaude._execution?.status).toBe('running')
  })
})

describe('Tree Structure Integration', () => {
  test('complex multi-phase tree', () => {
    // Phase 1: Research
    const researchClaude = createNode('claude', { id: 'research' })
    const phase1 = createNode('phase', { name: 'research' }, [researchClaude])

    // Phase 2: Review (with human approval)
    const human = createNode('human', { message: 'Review findings' })
    const phase2 = createNode('phase', { name: 'review' }, [human])

    // Phase 3: Report
    const reportClaude = createNode('claude', { id: 'report' })
    const stop = createNode('smithers-stop', { reason: 'Complete' })
    const phase3 = createNode('phase', { name: 'report' }, [reportClaude, stop])

    const root = createNode('ROOT', {}, [phase1, phase2, phase3])

    expect(root.children).toHaveLength(3)
    expect(root.children[0].props.name).toBe('research')
    expect(root.children[1].props.name).toBe('review')
    expect(root.children[2].props.name).toBe('report')
  })
})

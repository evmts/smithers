import { describe, it, expect } from 'bun:test'
import {
  findPendingExecutables,
  findStopNode,
  findHumanNode,
} from '../src/core/execute.js'
import type { SmithersNode, ExecutionState } from '../src/core/types.js'

/**
 * Execute Module Helper Function Tests
 *
 * Tests the internal helper functions in execute.ts:
 * - findPendingExecutables: Finds nodes ready for execution
 * - findStopNode: Finds Stop nodes in the tree
 * - findHumanNode: Finds Human nodes in the tree
 */

// Helper to create test nodes
function createNode(
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

  // Set up parent references
  for (const child of children) {
    child.parent = node
    node.children.push(child)
  }

  return node
}

describe('findPendingExecutables', () => {
  describe('basic detection', () => {
    it('finds claude node without execution state', () => {
      const claude = createNode('claude')
      const root = createNode('ROOT', {}, [claude])

      const pending = findPendingExecutables(root)

      expect(pending).toHaveLength(1)
      expect(pending[0]).toBe(claude)
    })

    it('does not find subagent node (only claude nodes are executable)', () => {
      // findPendingExecutables only looks for claude/claude-cli nodes
      const subagent = createNode('subagent')
      const root = createNode('ROOT', {}, [subagent])

      const pending = findPendingExecutables(root)

      // Subagent nodes themselves are not executable - only claude nodes within them
      expect(pending).toHaveLength(0)
    })

    it('finds claude node with pending status', () => {
      const claude = createNode('claude', {}, [], { status: 'pending' })
      const root = createNode('ROOT', {}, [claude])

      const pending = findPendingExecutables(root)

      expect(pending).toHaveLength(1)
    })

    it('does not find claude node with complete status and matching hash', () => {
      // The content hash for a claude node with no props/children is just 'claude'
      const claude = createNode('claude', {}, [], {
        status: 'complete',
        result: 'done',
        contentHash: 'claude', // Hash matches the node's actual computed hash
      })
      const root = createNode('ROOT', {}, [claude])

      const pending = findPendingExecutables(root)

      expect(pending).toHaveLength(0)
    })

    it('does not find claude node with running status', () => {
      const claude = createNode('claude', {}, [], { status: 'running' })
      const root = createNode('ROOT', {}, [claude])

      const pending = findPendingExecutables(root)

      expect(pending).toHaveLength(0)
    })

    it('does not find claude node with error status and matching hash', () => {
      // The content hash for a claude node with no props/children is just 'claude'
      const claude = createNode('claude', {}, [], {
        status: 'error',
        error: new Error('test'),
        contentHash: 'claude', // Hash matches the node's actual computed hash
      })
      const root = createNode('ROOT', {}, [claude])

      const pending = findPendingExecutables(root)

      expect(pending).toHaveLength(0)
    })
  })

  describe('tree traversal', () => {
    it('finds claude nodes in nested structure', () => {
      const claude1 = createNode('claude')
      const claude2 = createNode('claude')
      const phase1 = createNode('phase', { name: 'phase1' }, [claude1])
      const phase2 = createNode('phase', { name: 'phase2' }, [claude2])
      const root = createNode('ROOT', {}, [phase1, phase2])

      const pending = findPendingExecutables(root)

      expect(pending).toHaveLength(2)
      expect(pending).toContain(claude1)
      expect(pending).toContain(claude2)
    })

    it('finds deeply nested claude nodes', () => {
      const claude = createNode('claude')
      const step = createNode('step', {}, [claude])
      const phase = createNode('phase', { name: 'deep' }, [step])
      const subagent = createNode('subagent', {}, [phase])
      const root = createNode('ROOT', {}, [subagent])

      const pending = findPendingExecutables(root)

      expect(pending).toHaveLength(1)
      expect(pending[0]).toBe(claude)
    })

    it('finds claude inside subagent (subagent itself is not executable)', () => {
      const claude = createNode('claude')
      const subagent = createNode('subagent', {}, [claude])
      const root = createNode('ROOT', {}, [subagent])

      const pending = findPendingExecutables(root)

      // Only claude is found, not the subagent wrapper
      expect(pending).toHaveLength(1)
      expect(pending[0]).toBe(claude)
    })
  })

  describe('content change detection', () => {
    it('re-executes complete node if content hash changed', () => {
      // Node has props but the saved hash doesn't match
      const claude = createNode('claude', { key: 'value' }, [], {
        status: 'complete',
        result: 'old result',
        contentHash: 'claude', // This is wrong - should include the key:value prop
      })
      const root = createNode('ROOT', {}, [claude])

      const pending = findPendingExecutables(root)

      // Content hash won't match because the actual hash is 'claude|key:"value"'
      expect(pending).toHaveLength(1)
    })

    it('does not re-execute complete node if content unchanged', () => {
      // Create a node and compute what its hash would be
      const claude = createNode('claude', {}, [])

      // First pass - no execution state
      const root1 = createNode('ROOT', {}, [claude])
      const pending1 = findPendingExecutables(root1)
      expect(pending1).toHaveLength(1)

      // Mark as complete with matching hash (just 'claude' for a node with no props/children)
      claude._execution = {
        status: 'complete',
        result: 'result',
        contentHash: 'claude',
      }

      const pending2 = findPendingExecutables(root1)
      expect(pending2).toHaveLength(0)
    })
  })

  describe('mixed execution states', () => {
    it('finds only pending nodes in mixed tree', () => {
      // Hash is 'claude|id:1' (JSON.stringify gives "1" for number 1)
      const completeClaude = createNode('claude', { id: 1 }, [], {
        status: 'complete',
        result: 'done',
        contentHash: 'claude|id:1',
      })
      const pendingClaude = createNode('claude', { id: 2 })
      const runningClaude = createNode('claude', { id: 3 }, [], { status: 'running' })
      const root = createNode('ROOT', {}, [completeClaude, pendingClaude, runningClaude])

      const pending = findPendingExecutables(root)

      expect(pending).toHaveLength(1)
      expect(pending[0]).toBe(pendingClaude)
    })
  })

  describe('non-executable nodes', () => {
    it('ignores phase nodes', () => {
      const phase = createNode('phase', { name: 'test' })
      const root = createNode('ROOT', {}, [phase])

      const pending = findPendingExecutables(root)

      expect(pending).toHaveLength(0)
    })

    it('ignores step nodes', () => {
      const step = createNode('step')
      const root = createNode('ROOT', {}, [step])

      const pending = findPendingExecutables(root)

      expect(pending).toHaveLength(0)
    })

    it('ignores TEXT nodes', () => {
      const text = createNode('TEXT', { value: 'Hello' })
      const root = createNode('ROOT', {}, [text])

      const pending = findPendingExecutables(root)

      expect(pending).toHaveLength(0)
    })

    it('ignores stop nodes', () => {
      const stop = createNode('stop', { reason: 'done' })
      const root = createNode('ROOT', {}, [stop])

      const pending = findPendingExecutables(root)

      expect(pending).toHaveLength(0)
    })

    it('ignores human nodes', () => {
      const human = createNode('human', { message: 'Approve?' })
      const root = createNode('ROOT', {}, [human])

      const pending = findPendingExecutables(root)

      expect(pending).toHaveLength(0)
    })
  })

  describe('edge cases', () => {
    it('handles empty tree', () => {
      const root = createNode('ROOT')

      const pending = findPendingExecutables(root)

      expect(pending).toHaveLength(0)
    })

    it('handles single ROOT node', () => {
      const root = createNode('ROOT')

      const pending = findPendingExecutables(root)

      expect(pending).toHaveLength(0)
    })

    it('handles multiple levels of nesting', () => {
      const claude = createNode('claude')
      let current: SmithersNode = claude

      // Create 10 levels of nesting
      for (let i = 0; i < 10; i++) {
        const parent = createNode('phase', { name: `level${i}` }, [current])
        current = parent
      }

      const root = createNode('ROOT', {}, [current])

      const pending = findPendingExecutables(root)

      expect(pending).toHaveLength(1)
      expect(pending[0]).toBe(claude)
    })
  })
})

describe('findStopNode', () => {
  describe('basic detection', () => {
    it('finds stop node at root level', () => {
      const stop = createNode('stop', { reason: 'done' })
      const root = createNode('ROOT', {}, [stop])

      const found = findStopNode(root)

      expect(found).toBe(stop)
    })

    it('finds stop node with reason prop', () => {
      const stop = createNode('stop', { reason: 'Task complete' })
      const root = createNode('ROOT', {}, [stop])

      const found = findStopNode(root)

      expect(found).not.toBeNull()
      expect(found?.props.reason).toBe('Task complete')
    })

    it('returns null when no stop node exists', () => {
      const claude = createNode('claude')
      const root = createNode('ROOT', {}, [claude])

      const found = findStopNode(root)

      expect(found).toBeNull()
    })
  })

  describe('nested detection', () => {
    it('finds stop node nested in phase', () => {
      const stop = createNode('stop')
      const phase = createNode('phase', { name: 'end' }, [stop])
      const root = createNode('ROOT', {}, [phase])

      const found = findStopNode(root)

      expect(found).toBe(stop)
    })

    it('finds stop node deeply nested', () => {
      const stop = createNode('stop')
      const step = createNode('step', {}, [stop])
      const phase = createNode('phase', {}, [step])
      const subagent = createNode('subagent', {}, [phase])
      const root = createNode('ROOT', {}, [subagent])

      const found = findStopNode(root)

      expect(found).toBe(stop)
    })

    it('finds first stop node when multiple exist', () => {
      const stop1 = createNode('stop', { reason: 'first' })
      const stop2 = createNode('stop', { reason: 'second' })
      const root = createNode('ROOT', {}, [stop1, stop2])

      const found = findStopNode(root)

      expect(found?.props.reason).toBe('first')
    })
  })

  describe('edge cases', () => {
    it('handles empty tree', () => {
      const root = createNode('ROOT')

      const found = findStopNode(root)

      expect(found).toBeNull()
    })

    it('handles tree with only TEXT nodes', () => {
      const text1 = createNode('TEXT', { value: 'Hello' })
      const text2 = createNode('TEXT', { value: 'World' })
      const root = createNode('ROOT', {}, [text1, text2])

      const found = findStopNode(root)

      expect(found).toBeNull()
    })

    it('handles tree with claude but no stop', () => {
      const claude = createNode('claude')
      const phase = createNode('phase', {}, [claude])
      const root = createNode('ROOT', {}, [phase])

      const found = findStopNode(root)

      expect(found).toBeNull()
    })
  })
})

describe('findHumanNode', () => {
  describe('basic detection', () => {
    it('finds human node at root level', () => {
      const human = createNode('human', { message: 'Approve?' })
      const root = createNode('ROOT', {}, [human])

      const found = findHumanNode(root)

      expect(found).toBe(human)
    })

    it('finds human node with message prop', () => {
      const human = createNode('human', { message: 'Continue with deployment?' })
      const root = createNode('ROOT', {}, [human])

      const found = findHumanNode(root)

      expect(found).not.toBeNull()
      expect(found?.props.message).toBe('Continue with deployment?')
    })

    it('returns null when no human node exists', () => {
      const claude = createNode('claude')
      const root = createNode('ROOT', {}, [claude])

      const found = findHumanNode(root)

      expect(found).toBeNull()
    })
  })

  describe('nested detection', () => {
    it('finds human node nested in phase', () => {
      const human = createNode('human', { message: 'Review needed' })
      const phase = createNode('phase', { name: 'review' }, [human])
      const root = createNode('ROOT', {}, [phase])

      const found = findHumanNode(root)

      expect(found).toBe(human)
    })

    it('finds human node deeply nested', () => {
      const human = createNode('human')
      const step = createNode('step', {}, [human])
      const phase = createNode('phase', {}, [step])
      const subagent = createNode('subagent', {}, [phase])
      const root = createNode('ROOT', {}, [subagent])

      const found = findHumanNode(root)

      expect(found).toBe(human)
    })

    it('finds first human node when multiple exist', () => {
      const human1 = createNode('human', { message: 'first' })
      const human2 = createNode('human', { message: 'second' })
      const root = createNode('ROOT', {}, [human1, human2])

      const found = findHumanNode(root)

      expect(found?.props.message).toBe('first')
    })
  })

  describe('with callbacks', () => {
    it('finds human node with onApprove callback', () => {
      const onApprove = () => {}
      const human = createNode('human', { message: 'Approve?', onApprove })
      const root = createNode('ROOT', {}, [human])

      const found = findHumanNode(root)

      expect(found).not.toBeNull()
      expect(found?.props.onApprove).toBe(onApprove)
    })

    it('finds human node with onReject callback', () => {
      const onReject = () => {}
      const human = createNode('human', { message: 'Approve?', onReject })
      const root = createNode('ROOT', {}, [human])

      const found = findHumanNode(root)

      expect(found).not.toBeNull()
      expect(found?.props.onReject).toBe(onReject)
    })
  })

  describe('edge cases', () => {
    it('handles empty tree', () => {
      const root = createNode('ROOT')

      const found = findHumanNode(root)

      expect(found).toBeNull()
    })

    it('handles tree with only TEXT nodes', () => {
      const text1 = createNode('TEXT', { value: 'Hello' })
      const text2 = createNode('TEXT', { value: 'World' })
      const root = createNode('ROOT', {}, [text1, text2])

      const found = findHumanNode(root)

      expect(found).toBeNull()
    })

    it('handles tree with stop but no human', () => {
      const stop = createNode('stop', { reason: 'done' })
      const phase = createNode('phase', {}, [stop])
      const root = createNode('ROOT', {}, [phase])

      const found = findHumanNode(root)

      expect(found).toBeNull()
    })

    it('finds human before stop in same tree', () => {
      const human = createNode('human', { message: 'Review' })
      const stop = createNode('stop', { reason: 'done' })
      const root = createNode('ROOT', {}, [human, stop])

      const found = findHumanNode(root)

      expect(found).toBe(human)
    })
  })
})

describe('Tree Structure Integration', () => {
  // Tests that verify correct behavior when multiple
  // features are combined

  it('finds pending claude but ignores human and stop', () => {
    const claude = createNode('claude')
    const human = createNode('human', { message: 'Approve?' })
    const stop = createNode('stop', { reason: 'done' })
    const phase = createNode('phase', {}, [claude, human, stop])
    const root = createNode('ROOT', {}, [phase])

    const pending = findPendingExecutables(root)
    const humanNode = findHumanNode(root)
    const stopNode = findStopNode(root)

    expect(pending).toHaveLength(1)
    expect(pending[0]).toBe(claude)
    expect(humanNode).toBe(human)
    expect(stopNode).toBe(stop)
  })

  it('handles complex multi-phase tree', () => {
    // Phase 1: Research
    const researchClaude = createNode('claude', { id: 'research' })
    const phase1 = createNode('phase', { name: 'research' }, [researchClaude])

    // Phase 2: Review (with human approval)
    const human = createNode('human', { message: 'Review findings' })
    const phase2 = createNode('phase', { name: 'review' }, [human])

    // Phase 3: Report
    const reportClaude = createNode('claude', { id: 'report' })
    const stop = createNode('stop', { reason: 'Complete' })
    const phase3 = createNode('phase', { name: 'report' }, [reportClaude, stop])

    const root = createNode('ROOT', {}, [phase1, phase2, phase3])

    const pending = findPendingExecutables(root)
    const humanNode = findHumanNode(root)
    const stopNode = findStopNode(root)

    expect(pending).toHaveLength(2) // Both claude nodes
    expect(humanNode?.props.message).toBe('Review findings')
    expect(stopNode?.props.reason).toBe('Complete')
  })

  it('handles subagent with parallel execution', () => {
    const claude1 = createNode('claude', { id: 'task1' })
    const claude2 = createNode('claude', { id: 'task2' })
    const claude3 = createNode('claude', { id: 'task3' })
    const subagent = createNode('subagent', { parallel: true }, [claude1, claude2, claude3])
    const root = createNode('ROOT', {}, [subagent])

    const pending = findPendingExecutables(root)

    // Only 3 claude nodes are pending (subagent is not itself executable)
    expect(pending).toHaveLength(3)
    expect(pending).toContain(claude1)
    expect(pending).toContain(claude2)
    expect(pending).toContain(claude3)
  })
})

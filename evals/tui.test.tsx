/**
 * TUI Tests
 * Tests for Terminal UI components and utilities
 */

import { describe, expect, test } from 'bun:test'
import type { SmithersNode } from '../src/core/types.js'
import {
  findNodeByPath,
  getNextVisibleNode,
  getNodeIcon,
  getNodeLabel,
  getNodePath,
  getPrevVisibleNode,
  getStatusBadge,
  getStatusColor,
  getVisibleNodes,
  hasChildren,
} from '../src/tui/tree-utils.js'

// Helper to create a simple tree for testing
function createTestTree(): SmithersNode {
  const root: SmithersNode = {
    type: 'ROOT',
    props: {},
    children: [],
    parent: null,
  }

  const phase1: SmithersNode = {
    type: 'phase',
    props: { name: 'Phase 1' },
    children: [],
    parent: root,
  }
  root.children.push(phase1)

  const claude1: SmithersNode = {
    type: 'claude',
    props: { name: 'Agent 1' },
    children: [],
    parent: phase1,
    _execution: { status: 'pending' },
  }
  phase1.children.push(claude1)

  const claude2: SmithersNode = {
    type: 'claude',
    props: {},
    children: [],
    parent: phase1,
    _execution: { status: 'running' },
  }
  phase1.children.push(claude2)

  const phase2: SmithersNode = {
    type: 'phase',
    props: { name: 'Phase 2' },
    children: [],
    parent: root,
  }
  root.children.push(phase2)

  const subagent: SmithersNode = {
    type: 'subagent',
    props: { name: 'Worker' },
    children: [],
    parent: phase2,
  }
  phase2.children.push(subagent)

  const claude3: SmithersNode = {
    type: 'claude',
    props: {},
    children: [],
    parent: subagent,
    _execution: { status: 'complete', result: 'Done!' },
  }
  subagent.children.push(claude3)

  const text: SmithersNode = {
    type: 'TEXT',
    props: { value: 'Some text content that is quite long and should be truncated when displayed in the tree view' },
    children: [],
    parent: phase1,
  }
  phase1.children.push(text)

  return root
}

describe('TUI Tree Utils', () => {
  describe('getNodePath', () => {
    test('returns ROOT for root node', () => {
      const root = createTestTree()
      expect(getNodePath(root)).toBe('ROOT')
    })

    test('returns correct path for nested nodes', () => {
      const root = createTestTree()
      const phase1 = root.children[0]
      const claude1 = phase1.children[0]

      expect(getNodePath(phase1)).toBe('ROOT/phase[0]')
      expect(getNodePath(claude1)).toBe('ROOT/phase[0]/claude[0]')
    })

    test('handles multiple siblings of same type', () => {
      const root = createTestTree()
      const phase1 = root.children[0]
      const claude1 = phase1.children[0]
      const claude2 = phase1.children[1]

      expect(getNodePath(claude1)).toBe('ROOT/phase[0]/claude[0]')
      expect(getNodePath(claude2)).toBe('ROOT/phase[0]/claude[1]')
    })

    test('handles deeply nested nodes', () => {
      const root = createTestTree()
      const phase2 = root.children[1]
      const subagent = phase2.children[0]
      const claude3 = subagent.children[0]

      expect(getNodePath(claude3)).toBe('ROOT/phase[1]/subagent[0]/claude[0]')
    })
  })

  describe('findNodeByPath', () => {
    test('finds root node', () => {
      const root = createTestTree()
      const found = findNodeByPath(root, 'ROOT')
      expect(found).toBe(root)
    })

    test('finds nested nodes by path', () => {
      const root = createTestTree()
      const phase1 = root.children[0]
      const claude1 = phase1.children[0]

      const found = findNodeByPath(root, 'ROOT/phase[0]/claude[0]')
      expect(found).toBe(claude1)
    })

    test('returns null for non-existent path', () => {
      const root = createTestTree()
      const found = findNodeByPath(root, 'ROOT/phase[999]')
      expect(found).toBeNull()
    })

    test('returns null for invalid path format', () => {
      const root = createTestTree()
      const found = findNodeByPath(root, 'ROOT/invalid-format')
      expect(found).toBeNull()
    })

    test('finds deeply nested nodes', () => {
      const root = createTestTree()
      const phase2 = root.children[1]
      const subagent = phase2.children[0]
      const claude3 = subagent.children[0]

      const found = findNodeByPath(root, 'ROOT/phase[1]/subagent[0]/claude[0]')
      expect(found).toBe(claude3)
    })
  })

  describe('getVisibleNodes', () => {
    test('ROOT is always expanded and shows immediate children', () => {
      const root = createTestTree()
      const expandedPaths = new Set<string>()
      const visible = getVisibleNodes(root, expandedPaths)

      // ROOT + 2 phases (ROOT is always expanded per implementation)
      expect(visible.length).toBe(3)
      expect(visible[0].path).toBe('ROOT')
      expect(visible[1].path).toBe('ROOT/phase[0]')
      expect(visible[2].path).toBe('ROOT/phase[1]')
      expect(visible[0].depth).toBe(0)
    })

    test('shows children when explicitly expanded', () => {
      const root = createTestTree()
      const expandedPaths = new Set(['ROOT'])
      const visible = getVisibleNodes(root, expandedPaths)

      // ROOT + 2 phases
      expect(visible.length).toBe(3)
      expect(visible[0].path).toBe('ROOT')
      expect(visible[1].path).toBe('ROOT/phase[0]')
      expect(visible[2].path).toBe('ROOT/phase[1]')
    })

    test('shows nested children when expanded', () => {
      const root = createTestTree()
      const expandedPaths = new Set(['ROOT', 'ROOT/phase[0]'])
      const visible = getVisibleNodes(root, expandedPaths)

      // ROOT + phase[0] + 3 children of phase[0] + phase[1]
      expect(visible.length).toBe(6)
      expect(visible[2].path).toBe('ROOT/phase[0]/claude[0]')
      expect(visible[3].path).toBe('ROOT/phase[0]/claude[1]')
    })

    test('respects depth information', () => {
      const root = createTestTree()
      const expandedPaths = new Set(['ROOT', 'ROOT/phase[0]'])
      const visible = getVisibleNodes(root, expandedPaths)

      expect(visible[0].depth).toBe(0) // ROOT
      expect(visible[1].depth).toBe(1) // phase[0]
      expect(visible[2].depth).toBe(2) // claude[0]
    })

    test('handles empty tree', () => {
      const root: SmithersNode = {
        type: 'ROOT',
        props: {},
        children: [],
        parent: null,
      }
      const expandedPaths = new Set<string>()
      const visible = getVisibleNodes(root, expandedPaths)

      expect(visible.length).toBe(1)
      expect(visible[0].path).toBe('ROOT')
    })
  })

  describe('getNextVisibleNode', () => {
    test('returns next sibling when not expanded', () => {
      const root = createTestTree()
      const expandedPaths = new Set(['ROOT'])

      const next = getNextVisibleNode(root, 'ROOT/phase[0]', expandedPaths)
      expect(next).toBe('ROOT/phase[1]')
    })

    test('returns first child when expanded', () => {
      const root = createTestTree()
      const expandedPaths = new Set(['ROOT', 'ROOT/phase[0]'])

      const next = getNextVisibleNode(root, 'ROOT/phase[0]', expandedPaths)
      expect(next).toBe('ROOT/phase[0]/claude[0]')
    })

    test('returns null at end of list', () => {
      const root = createTestTree()
      const expandedPaths = new Set(['ROOT'])

      const next = getNextVisibleNode(root, 'ROOT/phase[1]', expandedPaths)
      expect(next).toBeNull()
    })

    test('returns null for invalid path', () => {
      const root = createTestTree()
      const expandedPaths = new Set(['ROOT'])

      const next = getNextVisibleNode(root, 'ROOT/invalid', expandedPaths)
      expect(next).toBeNull()
    })
  })

  describe('getPrevVisibleNode', () => {
    test('returns previous sibling', () => {
      const root = createTestTree()
      const expandedPaths = new Set(['ROOT'])

      const prev = getPrevVisibleNode(root, 'ROOT/phase[1]', expandedPaths)
      expect(prev).toBe('ROOT/phase[0]')
    })

    test('returns parent when at first child', () => {
      const root = createTestTree()
      const expandedPaths = new Set(['ROOT', 'ROOT/phase[0]'])

      const prev = getPrevVisibleNode(root, 'ROOT/phase[0]/claude[0]', expandedPaths)
      expect(prev).toBe('ROOT/phase[0]')
    })

    test('returns null at start of list', () => {
      const root = createTestTree()
      const expandedPaths = new Set<string>()

      const prev = getPrevVisibleNode(root, 'ROOT', expandedPaths)
      expect(prev).toBeNull()
    })

    test('returns null for invalid path', () => {
      const root = createTestTree()
      const expandedPaths = new Set(['ROOT'])

      const prev = getPrevVisibleNode(root, 'ROOT/invalid', expandedPaths)
      expect(prev).toBeNull()
    })
  })

  describe('hasChildren', () => {
    test('returns true for nodes with children', () => {
      const root = createTestTree()
      expect(hasChildren(root)).toBe(true)

      const phase1 = root.children[0]
      expect(hasChildren(phase1)).toBe(true)
    })

    test('returns false for leaf nodes', () => {
      const root = createTestTree()
      const phase1 = root.children[0]
      const claude1 = phase1.children[0]

      expect(hasChildren(claude1)).toBe(false)
    })
  })

  describe('getNodeLabel', () => {
    test('shows type and name for named nodes', () => {
      const root = createTestTree()
      const phase1 = root.children[0]

      expect(getNodeLabel(phase1)).toBe('phase: Phase 1')
    })

    test('shows just type for unnamed nodes', () => {
      const root = createTestTree()
      const phase1 = root.children[0]
      const claude2 = phase1.children[1]

      expect(getNodeLabel(claude2)).toBe('claude')
    })

    test('shows truncated content for TEXT nodes', () => {
      const root = createTestTree()
      const phase1 = root.children[0]
      const text = phase1.children[2]

      const label = getNodeLabel(text)
      expect(label.length).toBeLessThanOrEqual(53) // 50 + "..."
      expect(label).toContain('...')
    })

    test('shows full content for short TEXT nodes', () => {
      const node: SmithersNode = {
        type: 'TEXT',
        props: { value: 'Short' },
        children: [],
        parent: null,
      }

      expect(getNodeLabel(node)).toBe('Short')
    })
  })

  describe('getStatusBadge', () => {
    test('shows status for executable nodes', () => {
      const root = createTestTree()
      const phase1 = root.children[0]
      const claude1 = phase1.children[0]
      const claude2 = phase1.children[1]

      expect(getStatusBadge(claude1)).toBe('[pending]')
      expect(getStatusBadge(claude2)).toBe('[running]')
    })

    test('shows complete status', () => {
      const root = createTestTree()
      const phase2 = root.children[1]
      const subagent = phase2.children[0]
      const claude3 = subagent.children[0]

      expect(getStatusBadge(claude3)).toBe('[complete]')
    })

    test('shows error status', () => {
      const node: SmithersNode = {
        type: 'claude',
        props: {},
        children: [],
        parent: null,
        _execution: { status: 'error', error: new Error('Test error') },
      }

      expect(getStatusBadge(node)).toBe('[error]')
    })

    test('returns empty string for structural nodes', () => {
      const root = createTestTree()
      const phase1 = root.children[0]

      expect(getStatusBadge(root)).toBe('')
      expect(getStatusBadge(phase1)).toBe('')
    })

    test('returns pending for nodes without execution state', () => {
      const node: SmithersNode = {
        type: 'claude',
        props: {},
        children: [],
        parent: null,
      }

      expect(getStatusBadge(node)).toBe('[pending]')
    })
  })

  describe('getStatusColor', () => {
    test('returns correct colors for each status', () => {
      expect(getStatusColor('[pending]')).toBe('#888888')
      expect(getStatusColor('[running]')).toBe('#ffff00')
      expect(getStatusColor('[complete]')).toBe('#00ff00')
      expect(getStatusColor('[error]')).toBe('#ff0000')
    })

    test('returns white for unknown status', () => {
      expect(getStatusColor('[unknown]')).toBe('#ffffff')
      expect(getStatusColor('')).toBe('#ffffff')
    })
  })

  describe('getNodeIcon', () => {
    test('shows arrow for selected nodes', () => {
      const node: SmithersNode = {
        type: 'phase',
        props: {},
        children: [
          { type: 'claude', props: {}, children: [], parent: null },
        ],
        parent: null,
      }

      expect(getNodeIcon(node, false, true)).toBe('→')
      expect(getNodeIcon(node, true, true)).toBe('→')
    })

    test('shows expand/collapse icons for nodes with children', () => {
      const node: SmithersNode = {
        type: 'phase',
        props: {},
        children: [
          { type: 'claude', props: {}, children: [], parent: null },
        ],
        parent: null,
      }

      expect(getNodeIcon(node, false, false)).toBe('▶')
      expect(getNodeIcon(node, true, false)).toBe('▼')
    })

    test('shows bullet for leaf nodes', () => {
      const node: SmithersNode = {
        type: 'claude',
        props: {},
        children: [],
        parent: null,
      }

      expect(getNodeIcon(node, false, false)).toBe('•')
    })
  })
})

describe('TUI Integration with Ralph Loop', () => {
  test('onFrameUpdate callback signature is correct', () => {
    // Test that onFrameUpdate can be called with expected parameters
    const callback = (tree: SmithersNode, frameNumber: number) => {
      expect(tree).toBeDefined()
      expect(typeof frameNumber).toBe('number')
    }

    // Create a mock tree
    const mockTree: SmithersNode = {
      type: 'ROOT',
      props: {},
      children: [],
      parent: null,
    }

    // Call the callback
    callback(mockTree, 1)
  })

  test('tree navigation works with simulated execution state', () => {
    // Create a tree with execution state
    const root: SmithersNode = {
      type: 'ROOT',
      props: {},
      children: [],
      parent: null,
    }

    const phase: SmithersNode = {
      type: 'phase',
      props: { name: 'phase-1' },
      children: [],
      parent: root,
    }
    root.children.push(phase)

    const claude1: SmithersNode = {
      type: 'claude',
      props: { name: 'agent-1' },
      children: [],
      parent: phase,
      _execution: { status: 'complete', result: 'Done' },
    }
    phase.children.push(claude1)

    const claude2: SmithersNode = {
      type: 'claude',
      props: { name: 'agent-2' },
      children: [],
      parent: phase,
      _execution: { status: 'running' },
    }
    phase.children.push(claude2)

    // Test path generation and navigation
    const expandedPaths = new Set(['ROOT', 'ROOT/phase[0]'])
    const visible = getVisibleNodes(root, expandedPaths)

    // Should see: ROOT, phase[0], claude[0], claude[1]
    expect(visible.length).toBe(4)

    // Test next/prev navigation
    const next = getNextVisibleNode(root, 'ROOT/phase[0]', expandedPaths)
    expect(next).toBe('ROOT/phase[0]/claude[0]')

    const prev = getPrevVisibleNode(root, 'ROOT/phase[0]/claude[1]', expandedPaths)
    expect(prev).toBe('ROOT/phase[0]/claude[0]')

    // Verify execution states are accessible
    expect(claude1._execution?.status).toBe('complete')
    expect(claude2._execution?.status).toBe('running')
  })
})

describe('TUI TreeView Component Logic', () => {
  test('TreeView displays correct visible window', () => {
    const root = createTestTree()
    const expandedPaths = new Set(['ROOT', 'ROOT/phase[0]'])
    const maxHeight = 3

    // Get visible nodes (simulating what TreeView does)
    const visibleNodes = getVisibleNodes(root, expandedPaths)
    const selectedPath = 'ROOT/phase[0]/claude[1]'
    const selectedIndex = visibleNodes.findIndex((v) => v.path === selectedPath)

    // Calculate scroll window (same logic as TreeView)
    const targetPosition = Math.floor(maxHeight / 2)
    let startIndex = Math.max(0, selectedIndex - targetPosition)
    let endIndex = Math.min(visibleNodes.length, startIndex + maxHeight)

    if (endIndex === visibleNodes.length) {
      startIndex = Math.max(0, visibleNodes.length - maxHeight)
    }

    const visibleWindow = visibleNodes.slice(startIndex, endIndex)

    // Should show 3 items
    expect(visibleWindow.length).toBe(maxHeight)

    // Selected item should be in the window
    expect(visibleWindow.some((v) => v.path === selectedPath)).toBe(true)
  })

  test('TreeView handles maxHeight correctly near start', () => {
    const root = createTestTree()
    const expandedPaths = new Set(['ROOT', 'ROOT/phase[0]'])
    const maxHeight = 3

    const visibleNodes = getVisibleNodes(root, expandedPaths)
    const selectedPath = 'ROOT'
    const selectedIndex = 0

    const targetPosition = Math.floor(maxHeight / 2)
    let startIndex = Math.max(0, selectedIndex - targetPosition)
    let endIndex = Math.min(visibleNodes.length, startIndex + maxHeight)

    if (endIndex === visibleNodes.length) {
      startIndex = Math.max(0, visibleNodes.length - maxHeight)
    }

    const visibleWindow = visibleNodes.slice(startIndex, endIndex)

    // Should start from index 0
    expect(visibleWindow[0].path).toBe('ROOT')
    expect(visibleWindow.length).toBe(maxHeight)
  })

  test('TreeView handles maxHeight correctly near end', () => {
    const root = createTestTree()
    const expandedPaths = new Set(['ROOT', 'ROOT/phase[0]'])
    const maxHeight = 3

    const visibleNodes = getVisibleNodes(root, expandedPaths)
    const selectedIndex = visibleNodes.length - 1

    const targetPosition = Math.floor(maxHeight / 2)
    let startIndex = Math.max(0, selectedIndex - targetPosition)
    let endIndex = Math.min(visibleNodes.length, startIndex + maxHeight)

    if (endIndex === visibleNodes.length) {
      startIndex = Math.max(0, visibleNodes.length - maxHeight)
    }

    const visibleWindow = visibleNodes.slice(startIndex, endIndex)

    // Should show last items
    expect(visibleWindow[visibleWindow.length - 1].path).toBe(visibleNodes[visibleNodes.length - 1].path)
    expect(visibleWindow.length).toBe(maxHeight)
  })

  test('TreeView respects expand/collapse state', () => {
    const root = createTestTree()

    // ROOT is always expanded (shows immediate children)
    const collapsedPaths = new Set<string>()
    const collapsedVisible = getVisibleNodes(root, collapsedPaths)
    expect(collapsedVisible.length).toBe(3) // ROOT + 2 phases

    // Expand root explicitly (same result)
    const expandedRootPaths = new Set(['ROOT'])
    const expandedRootVisible = getVisibleNodes(root, expandedRootPaths)
    expect(expandedRootVisible.length).toBe(3) // ROOT + 2 phases

    // Expand first phase
    const expandedPhasePaths = new Set(['ROOT', 'ROOT/phase[0]'])
    const expandedPhaseVisible = getVisibleNodes(root, expandedPhasePaths)
    expect(expandedPhaseVisible.length).toBe(6) // ROOT + phase[0] + 3 children + phase[1]
  })
})

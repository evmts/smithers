/**
 * Tests for interactive CLI commands
 */

import { test, expect } from 'bun:test'
import type { SmithersNode } from '@evmts/smithers'
import { executePlan, Claude, Phase } from '@evmts/smithers'
import {
  ExecutionController,
  parseCommand,
  handleCommand,
  formatTree,
  formatDuration,
} from '@evmts/smithers-cli/interactive'
import { createElement } from 'react'
import { create } from 'zustand'

// Helper to create mock tree
function createMockTree(): SmithersNode {
  const root: SmithersNode = {
    type: 'ROOT',
    props: {},
    children: [],
    parent: null,
    _execution: undefined,
  }

  const phase1: SmithersNode = {
    type: 'phase',
    props: { name: 'planning' },
    children: [],
    parent: root,
    _execution: undefined,
  }

  const claude1: SmithersNode = {
    type: 'claude',
    props: {},
    children: [],
    parent: phase1,
    _execution: { status: 'complete', result: 'Plan created' },
  }

  const phase2: SmithersNode = {
    type: 'phase',
    props: { name: 'implementation' },
    children: [],
    parent: root,
    _execution: undefined,
  }

  const claude2: SmithersNode = {
    type: 'claude',
    props: {},
    children: [],
    parent: phase2,
    _execution: { status: 'pending' }, // Make it pending so getStatus finds it
  }

  phase1.children = [claude1]
  phase2.children = [claude2]
  root.children = [phase1, phase2]

  return root
}

// Command Parsing Tests
test('parseCommand handles /pause', () => {
  const cmd = parseCommand('/pause')
  expect(cmd.command).toBe('pause')
  expect(cmd.args).toEqual([])
})

test('parseCommand handles /focus with path', () => {
  const cmd = parseCommand('/focus ROOT/claude[0]')
  expect(cmd.command).toBe('focus')
  expect(cmd.args).toEqual(['ROOT/claude[0]'])
})

test('parseCommand handles /inject with multiple words', () => {
  const cmd = parseCommand('/inject Use TypeScript strict mode')
  expect(cmd.command).toBe('inject')
  expect(cmd.args).toEqual(['Use', 'TypeScript', 'strict', 'mode'])
})

test('parseCommand throws for non-slash command', () => {
  expect(() => parseCommand('pause')).toThrow('Commands must start with /')
})

// ExecutionController Tests
test('ExecutionController pause/resume', () => {
  const controller = new ExecutionController()

  expect(controller.paused).toBe(false)
  controller.pause()
  expect(controller.paused).toBe(true)

  controller.resume()
  expect(controller.paused).toBe(false)
})

test('ExecutionController cannot resume when not paused', () => {
  const controller = new ExecutionController()
  expect(() => controller.resume()).toThrow('Cannot resume: not paused')
})

test('ExecutionController skip', () => {
  const controller = new ExecutionController()

  controller.skip()
  expect(controller.skipNextNode).toBe(true)
  expect(controller.skipNodePath).toBeUndefined()

  controller.skip('ROOT/claude[1]')
  expect(controller.skipNextNode).toBe(true)
  expect(controller.skipNodePath).toBe('ROOT/claude[1]')
})

test('ExecutionController inject', () => {
  const controller = new ExecutionController()

  controller.inject('Test prompt')
  expect(controller.injectedPrompt).toBe('Test prompt')
})

test('ExecutionController abort', () => {
  const controller = new ExecutionController()

  controller.abort('Test reason')
  expect(controller.aborted).toBe(true)
  expect(controller.abortReason).toBe('Test reason')
})

test('ExecutionController getStatus', () => {
  const controller = new ExecutionController()
  const tree = createMockTree()

  controller._updateState(5, tree)

  const status = controller.getStatus()
  expect(status.frame).toBe(5)
  expect(status.state).toBe('running')
  expect(status.pendingNodes.length).toBeGreaterThan(0)
  expect(status.completedNodes).toBeGreaterThan(0)
})

// Command Handler Tests
test('handleCommand - pause', () => {
  const controller = new ExecutionController()
  const result = handleCommand(parseCommand('/pause'), controller)

  expect(result.success).toBe(true)
  expect(result.message).toContain('Paused')
  expect(controller.paused).toBe(true)
})

test('handleCommand - resume', () => {
  const controller = new ExecutionController()
  controller.pause()

  const result = handleCommand(parseCommand('/resume'), controller)

  expect(result.success).toBe(true)
  expect(result.message).toContain('Resumed')
  expect(controller.paused).toBe(false)
})

test('handleCommand - status', () => {
  const controller = new ExecutionController()
  const tree = createMockTree()
  controller._updateState(3, tree)

  const result = handleCommand(parseCommand('/status'), controller, tree)

  expect(result.success).toBe(true)
  expect(result.message).toContain('Frame: 3')
  expect(result.message).toContain('State: running')
})

test('handleCommand - tree', () => {
  const tree = createMockTree()
  const result = handleCommand(parseCommand('/tree'), undefined as any, tree)

  expect(result.success).toBe(true)
  expect(result.message).toContain('ROOT')
  expect(result.message).toContain('phase')
})

test('handleCommand - tree --full', () => {
  const tree = createMockTree()
  const result = handleCommand(parseCommand('/tree --full'), undefined as any, tree)

  expect(result.success).toBe(true)
  expect(result.message).toContain('props:')
  expect(result.message).toContain('execution:')
})

test('handleCommand - skip', () => {
  const controller = new ExecutionController()
  const result = handleCommand(parseCommand('/skip'), controller)

  expect(result.success).toBe(true)
  expect(result.message).toContain('Will skip next pending node')
  expect(controller.skipNextNode).toBe(true)
})

test('handleCommand - skip with path', () => {
  const controller = new ExecutionController()
  const result = handleCommand(parseCommand('/skip ROOT/claude[1]'), controller)

  expect(result.success).toBe(true)
  expect(result.message).toContain('Will skip node: ROOT/claude[1]')
  expect(controller.skipNodePath).toBe('ROOT/claude[1]')
})

test('handleCommand - inject', () => {
  const controller = new ExecutionController()
  const result = handleCommand(parseCommand('/inject Test context'), controller)

  expect(result.success).toBe(true)
  expect(result.message).toContain('Test context')
  expect(controller.injectedPrompt).toBe('Test context')
})

test('handleCommand - abort', () => {
  const controller = new ExecutionController()
  const result = handleCommand(parseCommand('/abort Critical issue'), controller)

  expect(result.success).toBe(true)
  expect(result.message).toContain('Aborting')
  expect(controller.aborted).toBe(true)
  expect(controller.abortReason).toBe('Critical issue')
})

test('handleCommand - help', () => {
  const result = handleCommand(parseCommand('/help'), undefined as any)

  expect(result.success).toBe(true)
  expect(result.message).toContain('Available Commands')
  expect(result.message).toContain('/pause')
  expect(result.message).toContain('/resume')
})

test('handleCommand - help for specific command', () => {
  const result = handleCommand(parseCommand('/help pause'), undefined as any)

  expect(result.success).toBe(true)
  expect(result.message).toContain('/pause')
  expect(result.message).toContain('Pauses the Ralph Wiggum loop')
})

test('handleCommand - unknown command', () => {
  const controller = new ExecutionController()
  const result = handleCommand(parseCommand('/unknown'), controller)

  expect(result.success).toBe(false)
  expect(result.message).toContain('Unknown command')
})

// Format Tests
test('formatTree renders tree structure', () => {
  const tree = createMockTree()
  const formatted = formatTree(tree)

  expect(formatted).toContain('ROOT')
  expect(formatted).toContain('phase')
  expect(formatted).toContain('planning')
  expect(formatted).toContain('implementation')
})

test('formatTree with full option', () => {
  const tree = createMockTree()
  const formatted = formatTree(tree, { full: true })

  expect(formatted).toContain('props:')
  expect(formatted).toContain('name')
})

test('formatDuration formats milliseconds', () => {
  expect(formatDuration(1000)).toBe('1s')
  expect(formatDuration(65000)).toBe('1m 5s')
  expect(formatDuration(3665000)).toBe('1h 1m 5s')
})

// Integration Tests with executePlan
test('executePlan with controller - pause and resume', async () => {
  const controller = new ExecutionController()
  const store = create<{ count: number; increment: () => void }>((set) => ({
    count: 0,
    increment: () => set((s) => ({ count: s.count + 1 })),
  }))

  let frameCount = 0
  const agent = createElement(
    Phase,
    { name: 'test' },
    createElement(Claude, {
      onFinished: () => {
        frameCount++
        if (frameCount === 1) {
          // Pause after first execution
          controller.pause()
          // Resume after a delay
          setTimeout(() => controller.resume(), 100)
        }
        store.getState().increment()
      },
      children: 'Count is: ' + store.getState().count,
    })
  )

  const result = await executePlan(agent, {
    mockMode: true,
    controller,
    maxFrames: 3,
  })

  expect(result.frames).toBeGreaterThan(1)
  expect(store.getState().count).toBeGreaterThan(0)
})

test('executePlan with controller - abort', async () => {
  const controller = new ExecutionController()
  const store = create<{ count: number }>((set) => ({
    count: 0,
  }))

  const agent = createElement(
    Phase,
    { name: 'test' },
    createElement(Claude, {
      onFinished: () => {
        controller.abort('Test abort')
      },
      children: 'Test',
    })
  )

  await expect(
    executePlan(agent, {
      mockMode: true,
      controller,
    })
  ).rejects.toThrow('Execution aborted: Test abort')
})

test('executePlan with controller - skip node', async () => {
  const controller = new ExecutionController()
  const store = create<{ executed: boolean; phase: string }>((set) => ({
    executed: false,
    phase: 'first',
  }))

  // Delay skip until after first render
  let frameCount = 0

  const agent = () => {
    const { executed, phase } = store.getState()
    frameCount++

    // Skip on first frame
    if (frameCount === 1) {
      controller.skip()
    }

    return createElement(Phase, { name: phase },
      createElement(Claude, {
        onFinished: () => {
          store.setState({ executed: true, phase: 'second' })
        },
        children: `Phase: ${phase}`,
      })
    )
  }

  await executePlan(createElement(agent), {
    mockMode: true,
    controller,
    maxFrames: 5,
  })

  // The node was skipped, so executed should still be false
  expect(store.getState().executed).toBe(false)
})

test('executePlan with controller - inject prompt', async () => {
  const controller = new ExecutionController()
  let receivedPrompt = ''

  // Set up injection
  controller.inject('Additional context')

  const agent = createElement(Claude, {
    onFinished: (output) => {
      receivedPrompt = String(output)
    },
    children: 'Original prompt',
  })

  await executePlan(agent, {
    mockMode: true,
    controller,
  })

  // Mock executor should have received both prompts
  // (We can't directly verify this without inspecting internal state,
  // but the injection was cleared which means it was consumed)
  expect(controller.injectedPrompt).toBeUndefined()
})

test('controller reset clears all state', () => {
  const controller = new ExecutionController()

  controller.pause()
  controller.skip('path')
  controller.inject('prompt')
  controller.abort('reason')

  controller.reset()

  expect(controller.paused).toBe(false)
  expect(controller.skipNextNode).toBe(false)
  expect(controller.skipNodePath).toBeUndefined()
  expect(controller.injectedPrompt).toBeUndefined()
  expect(controller.aborted).toBe(false)
  expect(controller.abortReason).toBeUndefined()
})

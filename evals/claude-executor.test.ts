import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test'
import {
  createExecutionError,
  getNodePath,
  RateLimitError,
} from '../src/core/claude-executor.js'
import type { SmithersNode, ExecutionError, Tool } from '../src/core/types.js'

/**
 * Claude Executor Unit Tests
 *
 * Tests the Claude executor utility functions:
 * - createExecutionError: Rich error creation with context
 * - getNodePath: Node path generation for error messages
 * - RateLimitError: Rate limit error handling
 */
describe('createExecutionError', () => {
  it('creates an error with all required fields', () => {
    const error = createExecutionError('Test error message', {
      nodeType: 'claude',
      nodePath: 'ROOT > phase > claude',
    })

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Test error message')
    expect(error.name).toBe('ExecutionError')
    expect(error.nodeType).toBe('claude')
    expect(error.nodePath).toBe('ROOT > phase > claude')
  })

  it('includes optional input field', () => {
    const error = createExecutionError('Error with input', {
      nodeType: 'claude',
      nodePath: 'ROOT > claude',
      input: 'The original prompt content',
    })

    expect(error.input).toBe('The original prompt content')
  })

  it('includes optional failedTool field', () => {
    const error = createExecutionError('Tool execution failed', {
      nodeType: 'claude',
      nodePath: 'ROOT > claude',
      failedTool: 'file_read',
    })

    expect(error.failedTool).toBe('file_read')
  })

  it('includes optional toolInput field', () => {
    const toolInput = { path: '/tmp/test.txt', encoding: 'utf-8' }
    const error = createExecutionError('Tool error', {
      nodeType: 'claude',
      nodePath: 'ROOT > claude',
      toolInput,
    })

    expect(error.toolInput).toEqual(toolInput)
  })

  it('includes optional retriesAttempted field', () => {
    const error = createExecutionError('Max retries exceeded', {
      nodeType: 'claude',
      nodePath: 'ROOT > claude',
      retriesAttempted: 3,
    })

    expect(error.retriesAttempted).toBe(3)
  })

  it('includes optional cause field', () => {
    const originalError = new Error('Original error')
    const error = createExecutionError('Wrapped error', {
      nodeType: 'subagent',
      nodePath: 'ROOT > subagent',
      cause: originalError,
    })

    expect(error.cause).toBe(originalError)
  })

  it('includes all fields together', () => {
    const originalError = new Error('API error')
    const toolInput = { query: 'test' }

    const error = createExecutionError('Complete error', {
      nodeType: 'claude',
      nodePath: 'ROOT > phase[name="research"] > claude',
      input: 'Research the topic',
      failedTool: 'web_search',
      toolInput,
      retriesAttempted: 2,
      cause: originalError,
    })

    expect(error.message).toBe('Complete error')
    expect(error.name).toBe('ExecutionError')
    expect(error.nodeType).toBe('claude')
    expect(error.nodePath).toBe('ROOT > phase[name="research"] > claude')
    expect(error.input).toBe('Research the topic')
    expect(error.failedTool).toBe('web_search')
    expect(error.toolInput).toEqual(toolInput)
    expect(error.retriesAttempted).toBe(2)
    expect(error.cause).toBe(originalError)
  })

  it('handles empty optional fields', () => {
    const error = createExecutionError('Minimal error', {
      nodeType: 'claude',
      nodePath: 'ROOT',
    })

    expect(error.input).toBeUndefined()
    expect(error.failedTool).toBeUndefined()
    expect(error.toolInput).toBeUndefined()
    expect(error.retriesAttempted).toBeUndefined()
    expect(error.cause).toBeUndefined()
  })
})

describe('getNodePath', () => {
  function createNode(type: string, props: Record<string, unknown> = {}, parent: SmithersNode | null = null): SmithersNode {
    const node: SmithersNode = {
      type,
      props,
      children: [],
      parent,
    }
    return node
  }

  it('returns type for single node without parent', () => {
    const node = createNode('claude')
    const path = getNodePath(node)

    expect(path).toBe('claude')
  })

  it('includes name in path when present', () => {
    const node = createNode('phase', { name: 'research' })
    const path = getNodePath(node)

    expect(path).toBe('phase[name="research"]')
  })

  it('builds path through parent chain', () => {
    const root = createNode('ROOT')
    const phase = createNode('phase', { name: 'analyze' }, root)
    const claude = createNode('claude', {}, phase)

    const path = getNodePath(claude)

    expect(path).toBe('ROOT > phase[name="analyze"] > claude')
  })

  it('handles deeply nested nodes', () => {
    const root = createNode('ROOT')
    const phase1 = createNode('phase', { name: 'phase1' }, root)
    const subagent = createNode('subagent', { name: 'sub1' }, phase1)
    const phase2 = createNode('phase', { name: 'nested' }, subagent)
    const claude = createNode('claude', {}, phase2)

    const path = getNodePath(claude)

    expect(path).toBe('ROOT > phase[name="phase1"] > subagent[name="sub1"] > phase[name="nested"] > claude')
  })

  it('handles nodes without names in chain', () => {
    const root = createNode('ROOT')
    const phase = createNode('phase', {}, root) // No name
    const claude = createNode('claude', {}, phase)

    const path = getNodePath(claude)

    expect(path).toBe('ROOT > phase > claude')
  })

  it('handles mixed named and unnamed nodes', () => {
    const root = createNode('ROOT')
    const phase1 = createNode('phase', { name: 'named' }, root)
    const step = createNode('step', {}, phase1) // No name prop typically
    const claude = createNode('claude', { name: 'agent' }, step)

    const path = getNodePath(claude)

    expect(path).toBe('ROOT > phase[name="named"] > step > claude[name="agent"]')
  })

  it('handles special characters in name', () => {
    const node = createNode('phase', { name: 'test "quoted"' })
    const path = getNodePath(node)

    // The name is included as-is (may contain quotes)
    expect(path).toContain('test "quoted"')
  })

  it('handles numeric name values', () => {
    // Name could technically be a number
    const node = createNode('phase', { name: 123 })
    const path = getNodePath(node)

    expect(path).toContain('[name="123"]')
  })

  it('handles empty string name', () => {
    const node = createNode('phase', { name: '' })
    const path = getNodePath(node)

    // Empty string name should still be included
    expect(path).toBe('phase[name=""]')
  })
})

describe('RateLimitError', () => {
  it('creates error with correct name', () => {
    const error = new RateLimitError('Rate limit exceeded', 5000)

    expect(error.name).toBe('RateLimitError')
  })

  it('stores message correctly', () => {
    const error = new RateLimitError('Too many requests', 3000)

    expect(error.message).toBe('Too many requests')
  })

  it('stores retryAfter value', () => {
    const error = new RateLimitError('Rate limited', 10000)

    expect(error.retryAfter).toBe(10000)
  })

  it('is an instance of Error', () => {
    const error = new RateLimitError('Error', 1000)

    expect(error).toBeInstanceOf(Error)
  })

  it('has a stack trace', () => {
    const error = new RateLimitError('With stack', 2000)

    expect(error.stack).toBeDefined()
    expect(error.stack).toContain('RateLimitError')
  })

  it('can be caught as an Error', () => {
    let caught: Error | null = null

    try {
      throw new RateLimitError('Thrown error', 5000)
    } catch (e) {
      caught = e as Error
    }

    expect(caught).not.toBeNull()
    expect(caught).toBeInstanceOf(RateLimitError)
    expect((caught as RateLimitError).retryAfter).toBe(5000)
  })

  it('handles zero retryAfter', () => {
    const error = new RateLimitError('Immediate retry', 0)

    expect(error.retryAfter).toBe(0)
  })

  it('handles large retryAfter values', () => {
    const error = new RateLimitError('Long wait', 3600000) // 1 hour

    expect(error.retryAfter).toBe(3600000)
  })
})

describe('Error Context Integration', () => {
  // These tests verify that errors created from various scenarios
  // contain useful information for debugging

  it('execution error can be serialized to JSON', () => {
    const error = createExecutionError('Serializable error', {
      nodeType: 'claude',
      nodePath: 'ROOT > claude',
      input: 'test input',
      retriesAttempted: 1,
    })

    const json = JSON.stringify({
      name: error.name,
      message: error.message,
      nodeType: error.nodeType,
      nodePath: error.nodePath,
      input: error.input,
      retriesAttempted: error.retriesAttempted,
    })

    const parsed = JSON.parse(json)
    expect(parsed.name).toBe('ExecutionError')
    expect(parsed.message).toBe('Serializable error')
    expect(parsed.nodeType).toBe('claude')
  })

  it('error chain preserves cause information', () => {
    const originalError = new Error('Original API failure')
    const wrappedError = createExecutionError('Wrapped: Original API failure', {
      nodeType: 'claude',
      nodePath: 'ROOT > claude',
      cause: originalError,
    })

    expect(wrappedError.cause).toBe(originalError)
    expect(wrappedError.cause?.message).toBe('Original API failure')
  })

  it('tool error includes all relevant context', () => {
    const toolInput = {
      query: 'search term',
      maxResults: 10,
      filters: { dateRange: 'past_week' },
    }

    const error = createExecutionError('Tool "web_search" failed: timeout', {
      nodeType: 'claude',
      nodePath: 'ROOT > phase[name="research"] > claude',
      input: 'Please search for information about...',
      failedTool: 'web_search',
      toolInput,
      retriesAttempted: 3,
    })

    // All context is available for debugging
    expect(error.failedTool).toBe('web_search')
    expect(error.toolInput).toEqual(toolInput)
    expect(error.retriesAttempted).toBe(3)
    expect(error.nodePath).toContain('research')
  })
})

describe('Node Path Edge Cases', () => {
  function createNodeChain(types: Array<{ type: string; name?: string }>): SmithersNode {
    let parent: SmithersNode | null = null
    let current: SmithersNode | null = null

    for (const { type, name } of types) {
      current = {
        type,
        props: name ? { name } : {},
        children: [],
        parent,
      }
      parent = current
    }

    return current!
  }

  it('handles single ROOT node', () => {
    const node = createNodeChain([{ type: 'ROOT' }])
    expect(getNodePath(node)).toBe('ROOT')
  })

  it('handles long chains', () => {
    const node = createNodeChain([
      { type: 'ROOT' },
      { type: 'subagent', name: 's1' },
      { type: 'phase', name: 'p1' },
      { type: 'step' },
      { type: 'phase', name: 'p2' },
      { type: 'step' },
      { type: 'claude', name: 'final' },
    ])

    const path = getNodePath(node)
    expect(path).toContain('ROOT')
    expect(path).toContain('subagent[name="s1"]')
    expect(path).toContain('phase[name="p1"]')
    expect(path).toContain('claude[name="final"]')
  })

  it('handles various node types', () => {
    const nodeTypes = ['persona', 'constraints', 'task', 'human', 'stop']

    for (const type of nodeTypes) {
      const node = createNodeChain([{ type: 'ROOT' }, { type, name: 'test' }])
      const path = getNodePath(node)

      expect(path).toBe(`ROOT > ${type}[name="test"]`)
    }
  })

  it('handles TEXT node type', () => {
    const parent: SmithersNode = { type: 'phase', props: {}, children: [], parent: null }
    const textNode: SmithersNode = {
      type: 'TEXT',
      props: { value: 'Some text content' },
      children: [],
      parent,
    }

    const path = getNodePath(textNode)
    expect(path).toBe('phase > TEXT')
  })
})

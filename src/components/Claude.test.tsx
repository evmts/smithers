/**
 * Unit tests for Claude.tsx - Claude component interface tests.
 * Tests the component's props and interface, not execution behavior.
 */
import { describe, test, expect, mock } from 'bun:test'
import { z } from 'zod'
import { createSmithersTool } from '../tools/createSmithersTool.js'
import type { ClaudeProps } from './Claude.js'

describe('ClaudeProps interface', () => {
  test('model is optional string', () => {
    const props: ClaudeProps = {}
    expect(props.model).toBeUndefined()
  })

  test('model can be set', () => {
    const props: ClaudeProps = { model: 'claude-opus-4' }
    expect(props.model).toBe('claude-opus-4')
  })

  test('maxTurns is optional number', () => {
    const props: ClaudeProps = { maxTurns: 5 }
    expect(props.maxTurns).toBe(5)
  })

  test('tools is optional array of tool specs', () => {
    const smithersTool = createSmithersTool({
      name: 'greet',
      description: 'Greet user',
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => ({ greeting: `hi ${name}` }),
    })
    const props: ClaudeProps = { tools: ['Read', 'Edit', 'Bash'] }
    expect(props.tools).toHaveLength(3)

    const propsWithSmithers: ClaudeProps = { tools: [smithersTool] }
    expect(propsWithSmithers.tools).toHaveLength(1)
  })

  test('systemPrompt is optional string', () => {
    const props: ClaudeProps = { systemPrompt: 'You are a helpful assistant' }
    expect(props.systemPrompt).toBe('You are a helpful assistant')
  })

  test('onFinished is optional callback', () => {
    const callback = mock(() => {})
    const props: ClaudeProps = { onFinished: callback }

    props.onFinished?.('result')
    expect(callback).toHaveBeenCalledWith('result')
  })

  test('onError is optional callback', () => {
    const callback = mock(() => {})
    const props: ClaudeProps = { onError: callback }

    const error = new Error('test')
    props.onError?.(error)
    expect(callback).toHaveBeenCalledWith(error)
  })

  test('validate is optional async function', async () => {
    const validate = mock(async () => true)
    const props: ClaudeProps = { validate }

    const result = await props.validate?.('test')
    expect(result).toBe(true)
    expect(validate).toHaveBeenCalledWith('test')
  })

  test('validate can return false', async () => {
    const validate = mock(async () => false)
    const props: ClaudeProps = { validate }

    const result = await props.validate?.('invalid')
    expect(result).toBe(false)
  })

  test('allows arbitrary additional props', () => {
    const props: ClaudeProps = {
      customProp: 'value',
      numberProp: 42,
      boolProp: true,
      objectProp: { key: 'value' },
    }

    expect(props.customProp).toBe('value')
    expect(props.numberProp).toBe(42)
  })

  test('children is optional', () => {
    const props: ClaudeProps = {}
    expect(props.children).toBeUndefined()
  })
})

// Note: Component rendering tests require React reconciler test environment setup.
// The interface tests above verify the prop types work correctly.

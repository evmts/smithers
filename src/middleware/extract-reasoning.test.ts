import { describe, test, expect } from 'bun:test'
import type { AgentResult } from '../components/agents/types.js'
import { extractReasoningMiddleware } from './extract-reasoning.js'

function makeResult(overrides?: Partial<AgentResult>): AgentResult {
  return {
    output: 'ok',
    structured: undefined,
    tokensUsed: { input: 10, output: 5 },
    turnsUsed: 1,
    stopReason: 'completed',
    durationMs: 100,
    ...overrides,
  }
}

describe('extractReasoningMiddleware', () => {
  test('extracts thinking tag content', () => {
    const middleware = extractReasoningMiddleware({ tagName: 'thinking' })
    const result = middleware.transformResult?.(
      makeResult({ output: '<thinking>step 1</thinking>answer here' })
    )

    expect(result?.reasoning).toBe('step 1')
    expect(result?.output).toBe('answer here')
  })

  test('extracts custom tag content', () => {
    const middleware = extractReasoningMiddleware({ tagName: 'reasoning' })
    const result = middleware.transformResult?.(
      makeResult({ output: '<reasoning>my thoughts</reasoning>final answer' })
    )

    expect(result?.reasoning).toBe('my thoughts')
    expect(result?.output).toBe('final answer')
  })

  test('handles multiple tags with default separator', () => {
    const middleware = extractReasoningMiddleware({ tagName: 'think' })
    const result = middleware.transformResult?.(
      makeResult({
        output: '<think>thought 1</think>text<think>thought 2</think>more text',
      })
    )

    expect(result?.reasoning).toBe('thought 1\nthought 2')
    expect(result?.output).toBe('textmore text')
  })

  test('uses custom separator for multiple tags', () => {
    const middleware = extractReasoningMiddleware({ tagName: 'think', separator: ' | ' })
    const result = middleware.transformResult?.(
      makeResult({
        output: '<think>first</think><think>second</think>answer',
      })
    )

    expect(result?.reasoning).toBe('first | second')
  })

  test('trims whitespace from reasoning content', () => {
    const middleware = extractReasoningMiddleware({ tagName: 'thinking' })
    const result = middleware.transformResult?.(
      makeResult({ output: '<thinking>  padded content  </thinking>answer' })
    )

    expect(result?.reasoning).toBe('padded content')
  })

  test('trims output after extraction', () => {
    const middleware = extractReasoningMiddleware({ tagName: 'thinking' })
    const result = middleware.transformResult?.(
      makeResult({ output: '<thinking>thoughts</thinking>  answer with spaces  ' })
    )

    expect(result?.output).toBe('answer with spaces')
  })

  test('startWithReasoning only trims leading whitespace', () => {
    const middleware = extractReasoningMiddleware({
      tagName: 'thinking',
      startWithReasoning: true,
    })
    const result = middleware.transformResult?.(
      makeResult({ output: '<thinking>thoughts</thinking>  answer  ' })
    )

    expect(result?.output).toBe('answer  ')
  })

  test('returns unchanged result when no tags found', () => {
    const middleware = extractReasoningMiddleware({ tagName: 'thinking' })
    const result = middleware.transformResult?.(
      makeResult({ output: 'no thinking tags here' })
    )

    expect(result?.reasoning).toBeUndefined()
    expect(result?.output).toBe('no thinking tags here')
  })

  test('handles empty tag content', () => {
    const middleware = extractReasoningMiddleware({ tagName: 'thinking' })
    const result = middleware.transformResult?.(
      makeResult({ output: '<thinking></thinking>answer' })
    )

    expect(result?.reasoning).toBe('')
    expect(result?.output).toBe('answer')
  })

  test('case insensitive tag matching', () => {
    const middleware = extractReasoningMiddleware({ tagName: 'thinking' })
    const result = middleware.transformResult?.(
      makeResult({ output: '<THINKING>content</THINKING>answer' })
    )

    expect(result?.reasoning).toBe('content')
    expect(result?.output).toBe('answer')
  })

  test('calls onReasoning callback', () => {
    let captured = ''
    const middleware = extractReasoningMiddleware({
      tagName: 'think',
      onReasoning: (r) => {
        captured = r
      },
    })

    middleware.transformResult?.(makeResult({ output: '<think>my thoughts</think>final' }))
    expect(captured).toBe('my thoughts')
  })

  test('onReasoning not called when no tags found', () => {
    let called = false
    const middleware = extractReasoningMiddleware({
      tagName: 'think',
      onReasoning: () => {
        called = true
      },
    })

    middleware.transformResult?.(makeResult({ output: 'no tags' }))
    expect(called).toBe(false)
  })

  test('handles multiline tag content', () => {
    const middleware = extractReasoningMiddleware({ tagName: 'thinking' })
    const result = middleware.transformResult?.(
      makeResult({
        output: `<thinking>
Step 1: Analyze
Step 2: Process
Step 3: Conclude
</thinking>The answer is 42`,
      })
    )

    expect(result?.reasoning).toBe('Step 1: Analyze\nStep 2: Process\nStep 3: Conclude')
    expect(result?.output).toBe('The answer is 42')
  })

  test('handles nested content in tags (not nested tags)', () => {
    const middleware = extractReasoningMiddleware({ tagName: 'thinking' })
    const result = middleware.transformResult?.(
      makeResult({
        output: '<thinking>Consider: {a: 1, b: 2}</thinking>done',
      })
    )

    expect(result?.reasoning).toBe('Consider: {a: 1, b: 2}')
  })

  test('handles special characters in content', () => {
    const middleware = extractReasoningMiddleware({ tagName: 'thinking' })
    const result = middleware.transformResult?.(
      makeResult({
        output: '<thinking>x > 5 && y < 10</thinking>result',
      })
    )

    expect(result?.reasoning).toBe('x > 5 && y < 10')
  })

  test('preserves other result properties', () => {
    const middleware = extractReasoningMiddleware({ tagName: 'thinking' })
    const result = middleware.transformResult?.(
      makeResult({
        output: '<thinking>thoughts</thinking>answer',
        tokensUsed: { input: 100, output: 50 },
        turnsUsed: 3,
        stopReason: 'completed',
        durationMs: 500,
        structured: { key: 'value' },
      })
    )

    expect(result?.tokensUsed).toEqual({ input: 100, output: 50 })
    expect(result?.turnsUsed).toBe(3)
    expect(result?.stopReason).toBe('completed')
    expect(result?.durationMs).toBe(500)
    expect(result?.structured).toEqual({ key: 'value' })
  })

  test('has correct middleware name', () => {
    const middleware = extractReasoningMiddleware({ tagName: 'thinking' })
    expect(middleware.name).toBe('extractReasoning')
  })

  test('handles tag at end of output', () => {
    const middleware = extractReasoningMiddleware({ tagName: 'thinking' })
    const result = middleware.transformResult?.(
      makeResult({ output: 'answer<thinking>afterthought</thinking>' })
    )

    expect(result?.reasoning).toBe('afterthought')
    expect(result?.output).toBe('answer')
  })

  test('handles only tags with no other content', () => {
    const middleware = extractReasoningMiddleware({ tagName: 'thinking' })
    const result = middleware.transformResult?.(
      makeResult({ output: '<thinking>just thoughts</thinking>' })
    )

    expect(result?.reasoning).toBe('just thoughts')
    expect(result?.output).toBe('')
  })
})

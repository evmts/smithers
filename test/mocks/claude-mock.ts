/**
 * Claude Mock Utilities for Testing
 *
 * Provides mock implementations of Claude responses for testing.
 */

export interface MockResponse {
  output: string
  model: 'claude-mock'
  turns: 1
  tokensUsed: {
    input: number
    output: number
  }
  durationMs: number
  stopReason: 'completed' | 'stop_condition' | 'error' | 'cancelled'
}

export interface ClaudeMockOptions {
  delay?: number
  failOnCall?: number
  responses?: string[]
}

/**
 * Create a configurable Claude mock.
 */
export function createClaudeMock(options: ClaudeMockOptions = {}) {
  let callCount = 0
  const { delay = 10, failOnCall, responses = [] } = options

  return async (prompt: string): Promise<MockResponse> => {
    callCount++

    if (failOnCall !== undefined && callCount === failOnCall) {
      throw new Error(`Mock failure on call ${callCount}`)
    }

    await new Promise(resolve => setTimeout(resolve, delay))

    const response = responses[callCount - 1] || `Mock response ${callCount}: ${prompt.slice(0, 50)}`

    return {
      output: response,
      model: 'claude-mock',
      turns: 1,
      tokensUsed: { input: prompt.length, output: response.length },
      durationMs: delay,
      stopReason: 'completed',
    }
  }
}

/**
 * Create a static mock that always returns the same response.
 */
export function createStaticMock(response: string, delay = 10) {
  return async (_prompt: string): Promise<MockResponse> => {
    await new Promise(resolve => setTimeout(resolve, delay))
    return {
      output: response,
      model: 'claude-mock',
      turns: 1,
      tokensUsed: { input: _prompt.length, output: response.length },
      durationMs: delay,
      stopReason: 'completed',
    }
  }
}

/**
 * Create a mock that returns responses in sequence.
 * @throws {Error} if responses array is empty
 */
export function createSequenceMock(responses: string[], delay = 10) {
  if (responses.length === 0) {
    throw new Error('createSequenceMock requires at least one response')
  }
  let index = 0

  return async (_prompt: string): Promise<MockResponse> => {
    await new Promise(resolve => setTimeout(resolve, delay))
    const response = responses[index % responses.length]
    index++
    return {
      output: response,
      model: 'claude-mock',
      turns: 1,
      tokensUsed: { input: _prompt.length, output: response.length },
      durationMs: delay,
      stopReason: 'completed',
    }
  }
}

/**
 * Claude Mock Utilities for Testing
 *
 * Provides mock implementations of Claude responses for testing.
 */

export interface MockResponse {
  output: string
  model: string
  turns: number
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
    }
  }
}

/**
 * Create a mock that returns responses in sequence.
 */
export function createSequenceMock(responses: string[], delay = 10) {
  let index = 0

  return async (_prompt: string): Promise<MockResponse> => {
    await new Promise(resolve => setTimeout(resolve, delay))
    const response = responses[index % responses.length]
    index++
    return {
      output: response,
      model: 'claude-mock',
      turns: 1,
    }
  }
}

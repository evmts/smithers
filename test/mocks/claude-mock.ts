/**
 * Mock Claude API for testing.
 *
 * Provides mock responses for Claude SDK calls during tests.
 * Supports structured output via schemas and configurable responses.
 */

import type { z } from 'zod'

export interface ClaudeMockConfig {
  prompt: string
  model?: string
  maxTurns?: number
  tools?: string[]
  systemPrompt?: string
  schema?: z.ZodType<any>
}

export interface ClaudeMockResponse {
  output: unknown
  model: string
  turns: number
}

/**
 * Default mock response generator.
 * Returns a mock response based on the prompt content.
 */
export function createDefaultMockResponse(config: ClaudeMockConfig): ClaudeMockResponse {
  const { prompt, model = 'claude-sonnet-4', schema } = config

  // If a schema is provided, generate mock data matching it
  if (schema) {
    const mockData = generateMockFromSchema(schema)
    return {
      output: mockData,
      model,
      turns: 1,
    }
  }

  // Check for specific patterns in the prompt for smarter mock responses
  const promptLower = prompt.toLowerCase()

  // JSON response pattern
  if (promptLower.includes('return') && promptLower.includes('json')) {
    const jsonMatch = prompt.match(/\{[^}]+\}/)
    if (jsonMatch) {
      try {
        return {
          output: JSON.parse(jsonMatch[0]),
          model,
          turns: 1,
        }
      } catch {
        // Fall through to default
      }
    }
  }

  // "Say exactly" pattern - return the quoted text
  const sayExactly = prompt.match(/[Ss]ay exactly[:\s]*["']?([^"'\n]+)["']?/)
  if (sayExactly) {
    return {
      output: sayExactly[1].trim(),
      model,
      turns: 1,
    }
  }

  // Default response
  return {
    output: `Mock response for: ${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}`,
    model,
    turns: 1,
  }
}

/**
 * Generate mock data from a Zod schema.
 */
function generateMockFromSchema(schema: z.ZodType<any>): unknown {
  // This is a simplified mock generator
  // In a real implementation, you'd introspect the schema more deeply
  const def = (schema as any)._def

  if (!def) {
    return { result: 'mock' }
  }

  switch (def.typeName) {
    case 'ZodString':
      return 'mock-string'
    case 'ZodNumber':
      return 42
    case 'ZodBoolean':
      return true
    case 'ZodArray':
      return []
    case 'ZodObject':
      const shape = def.shape?.()
      if (shape) {
        const result: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(shape)) {
          result[key] = generateMockFromSchema(value as z.ZodType<any>)
        }
        return result
      }
      return {}
    default:
      return { result: 'mock' }
  }
}

/**
 * Create a configurable Claude mock for tests.
 */
export function createClaudeMock(customResponder?: (config: ClaudeMockConfig) => ClaudeMockResponse) {
  return {
    execute: async (config: ClaudeMockConfig): Promise<ClaudeMockResponse> => {
      // Simulate some async delay
      await new Promise(resolve => setTimeout(resolve, 10))

      if (customResponder) {
        return customResponder(config)
      }

      return createDefaultMockResponse(config)
    },
  }
}

/**
 * Create a mock that always returns a specific response.
 */
export function createStaticMock(response: unknown) {
  return createClaudeMock(() => ({
    output: response,
    model: 'claude-sonnet-4',
    turns: 1,
  }))
}

/**
 * Create a mock that cycles through responses.
 */
export function createSequenceMock(responses: unknown[]) {
  let index = 0
  return createClaudeMock(() => {
    const response = responses[index % responses.length]
    index++
    return {
      output: response,
      model: 'claude-sonnet-4',
      turns: 1,
    }
  })
}

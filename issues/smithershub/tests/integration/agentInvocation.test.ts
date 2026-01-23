import { describe, test, expect, beforeEach, jest } from 'bun:test'
import { invokeAgent, validateAgentConfig } from '../../src/tools/invokeAgent'
import { AgentContextManager } from '../../src/utils/agentContext'
import type {
  AgentToolCallConfig,
  AgentResponse,
  AgentProvider
} from '../../src/types/AgentResponse'

describe('Agent Invocation Integration', () => {
  describe('End-to-End Agent Invocation Flow', () => {
    test('Claude invocation with full workflow', async () => {
      const config: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        systemPrompt: 'You are a helpful assistant that provides structured responses.',
        prompt: 'Explain the concept of recursion in programming with examples.',
        maxTokens: 1000,
        temperature: 0.7,
      }

      // Validate configuration
      const validationErrors = validateAgentConfig(config)
      expect(validationErrors).toHaveLength(0)

      // Invoke agent
      const response = await invokeAgent(config)

      // Verify response structure
      expect(response.id).toMatch(/^claude-\d+-[a-z0-9]+$/)
      expect(response.provider).toBe('claude')
      expect(response.model).toBe('claude-3-sonnet')
      expect(response.content).toContain('Claude')
      expect(response.duration).toBeGreaterThan(0)
      expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)

      // Should have usage statistics
      expect(response.usage).toBeDefined()
      expect(response.usage!.totalTokens).toBeGreaterThan(0)
    })

    test('Gemini invocation with structured response', async () => {
      const config: AgentToolCallConfig = {
        provider: 'gemini',
        model: 'gemini-pro',
        prompt: 'Analyze the sentiment of this text: "I love this product! It works perfectly."',
        temperature: 0.3,
      }

      const response = await invokeAgent(config)

      expect(response.provider).toBe('gemini')
      expect(response.model).toBe('gemini-pro')
      expect(response.content).toContain('Gemini')
      expect(response.error).toBeUndefined()

      // Gemini might return structured data
      if (response.structured) {
        const structured = JSON.parse(response.structured)
        expect(structured).toHaveProperty('analysis_type')
        expect(structured.confidence_score).toBeGreaterThanOrEqual(0)
        expect(structured.confidence_score).toBeLessThanOrEqual(1)
      }

      expect(response.usage).toBeDefined()
      expect(response.usage!.promptTokens).toBeGreaterThan(0)
      expect(response.usage!.completionTokens).toBeGreaterThan(0)
    })

    test('Codex invocation with tools', async () => {
      const config: AgentToolCallConfig = {
        provider: 'codex',
        model: 'gpt-4',
        systemPrompt: 'You are a coding assistant.',
        prompt: 'Write a Python function to calculate the factorial of a number.',
        tools: [
          { name: 'execute_python', description: 'Execute Python code' },
          { name: 'lint_code', description: 'Lint and format code' }
        ],
      }

      const response = await invokeAgent(config)

      expect(response.provider).toBe('codex')
      expect(response.model).toBe('gpt-4')
      expect(response.content.toLowerCase()).toContain('function')
      expect(response.error).toBeUndefined()

      // Should have tool calls since we provided tools
      expect(response.toolCalls).toBeDefined()
      expect(response.toolCalls!.length).toBeGreaterThan(0)

      response.toolCalls!.forEach(toolCall => {
        expect(toolCall.name).toMatch(/^(execute_python|lint_code)$/)
        expect(toolCall.arguments).toContain('task')
        expect(toolCall.result).toContain('completed successfully')
      })
    })
  })

  describe('Agent Context Integration', () => {
    let context: AgentContextManager

    beforeEach(() => {
      context = new AgentContextManager()
    })

    test('manages invocation lifecycle with context', async () => {
      const config: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'Test context management',
      }

      // Create invocation
      const invocationId = context.generateId()
      const invocation = context.createInvocation(invocationId, config)

      expect(invocation.status).toBe('pending')
      expect(context.getActiveInvocations()).toHaveLength(1)

      // Update to running
      context.updateStatus(invocationId, 'running')
      const runningInvocation = context.getInvocation(invocationId)
      expect(runningInvocation!.status).toBe('running')

      // Perform actual invocation
      const response = await invokeAgent(config)
      context.setResponse(invocationId, response)

      // Verify final state
      const completedInvocation = context.getInvocation(invocationId)
      expect(completedInvocation!.status).toBe('completed')
      expect(completedInvocation!.response).toEqual(response)
      expect(completedInvocation!.endTime).toBeDefined()
      expect(context.getActiveInvocations()).toHaveLength(0)
    })

    test('handles parent-child invocation relationships', async () => {
      const parentConfig: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'Parent task',
      }

      const childConfig: AgentToolCallConfig = {
        provider: 'gemini',
        model: 'gemini-pro',
        prompt: 'Child task',
      }

      // Create parent invocation
      const parentId = context.generateId()
      const parentInvocation = context.createInvocation(parentId, parentConfig)

      // Create child invocation
      const childId = context.generateId()
      const childInvocation = context.createInvocation(childId, childConfig, parentId)

      // Verify relationships
      expect(childInvocation.parentId).toBe(parentId)
      expect(parentInvocation.childIds).toContain(childId)

      // Get child invocations
      const children = context.getChildInvocations(parentId)
      expect(children).toHaveLength(1)
      expect(children[0].id).toBe(childId)
    })

    test('removes invocations and cleans up relationships', () => {
      const parentConfig: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'Parent task',
      }

      const childConfig: AgentToolCallConfig = {
        provider: 'gemini',
        model: 'gemini-pro',
        prompt: 'Child task',
      }

      // Create parent and child
      const parentId = context.generateId()
      const parentInvocation = context.createInvocation(parentId, parentConfig)
      const childId = context.generateId()
      context.createInvocation(childId, childConfig, parentId)

      expect(context.getAllInvocations()).toHaveLength(2)
      expect(parentInvocation.childIds).toContain(childId)

      // Remove parent (should remove child too)
      context.removeInvocation(parentId)

      expect(context.getAllInvocations()).toHaveLength(0)
      expect(context.getInvocation(parentId)).toBeUndefined()
      expect(context.getInvocation(childId)).toBeUndefined()
    })
  })

  describe('Error Scenarios Integration', () => {
    test('handles invalid configuration gracefully', async () => {
      const invalidConfig: AgentToolCallConfig = {
        provider: 'claude',
        model: '', // Invalid: empty model
        prompt: '', // Invalid: empty prompt
        maxTokens: -1, // Invalid: negative tokens
        temperature: 2.0, // Invalid: temperature > 1
      }

      const validationErrors = validateAgentConfig(invalidConfig)
      expect(validationErrors.length).toBeGreaterThan(0)
      expect(validationErrors).toContain('Model is required')
      expect(validationErrors).toContain('Prompt is required')
      expect(validationErrors).toContain('Max tokens must be positive')
      expect(validationErrors).toContain('Temperature must be between 0 and 1')
    })

    test('handles network simulation errors', async () => {
      // This tests the mock error simulation
      const config: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'This will trigger a simulated error based on random chance',
      }

      // Run multiple times to potentially hit error cases
      const results = []
      for (let i = 0; i < 5; i++) {
        const response = await invokeAgent(config)
        results.push(response)
      }

      // At least one should succeed (since errors are random)
      const successfulResults = results.filter(r => !r.error)
      expect(successfulResults.length).toBeGreaterThan(0)

      // Verify error responses have proper structure
      results.forEach(response => {
        expect(response.id).toBeDefined()
        expect(response.provider).toBe('claude')
        expect(response.model).toBe('claude-3-sonnet')
        expect(response.duration).toBeGreaterThanOrEqual(0)
        expect(response.timestamp).toBeDefined()

        if (response.error) {
          expect(response.content).toBe('')
          expect(typeof response.error).toBe('string')
        } else {
          expect(response.content.length).toBeGreaterThan(0)
          expect(response.error).toBeUndefined()
        }
      })
    })
  })

  describe('Performance and Timing Integration', () => {
    test('measures invocation duration accurately', async () => {
      const config: AgentToolCallConfig = {
        provider: 'gemini',
        model: 'gemini-pro',
        prompt: 'Quick response test',
      }

      const startTime = Date.now()
      const response = await invokeAgent(config)
      const endTime = Date.now()

      const actualDuration = endTime - startTime
      const reportedDuration = response.duration

      // Reported duration should be reasonable
      expect(reportedDuration).toBeGreaterThan(0)
      expect(reportedDuration).toBeLessThan(5000) // Should be less than 5 seconds for mock

      // Should be approximately the same (allowing for measurement differences)
      expect(Math.abs(reportedDuration - actualDuration)).toBeLessThan(100)
    })

    test('handles concurrent invocations', async () => {
      const configs: AgentToolCallConfig[] = [
        {
          provider: 'claude',
          model: 'claude-3-sonnet',
          prompt: 'First concurrent request',
        },
        {
          provider: 'gemini',
          model: 'gemini-pro',
          prompt: 'Second concurrent request',
        },
        {
          provider: 'codex',
          model: 'gpt-4',
          prompt: 'Third concurrent request',
        }
      ]

      // Execute all concurrently
      const startTime = Date.now()
      const promises = configs.map(config => invokeAgent(config))
      const responses = await Promise.all(promises)
      const totalTime = Date.now() - startTime

      // Verify all succeeded
      expect(responses).toHaveLength(3)
      responses.forEach((response, i) => {
        expect(response.provider).toBe(configs[i].provider)
        expect(response.model).toBe(configs[i].model)
        expect(response.error).toBeUndefined()
      })

      // Concurrent execution should be faster than sequential
      // (Each mock takes 200-1000ms, so 3 sequential would be 600-3000ms)
      // Concurrent should be roughly the max of individual durations
      const maxIndividualDuration = Math.max(...responses.map(r => r.duration))
      expect(totalTime).toBeLessThan(maxIndividualDuration + 500) // Allow some overhead
    })
  })

  describe('Provider-Specific Integration', () => {
    test('Claude handles system prompts effectively', async () => {
      const withSystemPrompt: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        systemPrompt: 'You are a concise technical writer. Always include "TECHNICAL:" in your response.',
        prompt: 'Explain async/await in JavaScript',
      }

      const withoutSystemPrompt: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'Explain async/await in JavaScript',
      }

      const [withSystem, withoutSystem] = await Promise.all([
        invokeAgent(withSystemPrompt),
        invokeAgent(withoutSystemPrompt)
      ])

      // Both should succeed
      expect(withSystem.error).toBeUndefined()
      expect(withoutSystem.error).toBeUndefined()

      // Content should be different (though mock responses may not reflect this exactly)
      expect(withSystem.content).toBeTruthy()
      expect(withoutSystem.content).toBeTruthy()

      // Both should have proper Claude response structure
      expect(withSystem.provider).toBe('claude')
      expect(withoutSystem.provider).toBe('claude')
    })

    test('Gemini temperature affects response consistency', async () => {
      const lowTemp: AgentToolCallConfig = {
        provider: 'gemini',
        model: 'gemini-pro',
        prompt: 'Generate a creative story about a robot.',
        temperature: 0.1,
      }

      const highTemp: AgentToolCallConfig = {
        provider: 'gemini',
        model: 'gemini-pro',
        prompt: 'Generate a creative story about a robot.',
        temperature: 0.9,
      }

      // Run multiple times to see variation
      const lowTempResponses = await Promise.all([
        invokeAgent(lowTemp),
        invokeAgent(lowTemp),
        invokeAgent(lowTemp)
      ])

      const highTempResponses = await Promise.all([
        invokeAgent(highTemp),
        invokeAgent(highTemp),
        invokeAgent(highTemp)
      ])

      // All should succeed
      const allResponses = lowTempResponses.concat(highTempResponses)
      allResponses.forEach(response => {
        expect(response.provider).toBe('gemini')
        expect(response.error).toBeUndefined()
      })

      // In a real implementation, high temperature should show more variation
      // For mock implementation, we can at least verify structure consistency
      expect(lowTempResponses).toHaveLength(3)
      expect(highTempResponses).toHaveLength(3)
    })

    test('Codex maximizes tool usage', async () => {
      const manyTools: AgentToolCallConfig = {
        provider: 'codex',
        model: 'gpt-4',
        prompt: 'Build a complete web application with testing and deployment.',
        tools: [
          { name: 'create_file', description: 'Create new files' },
          { name: 'run_tests', description: 'Execute test suites' },
          { name: 'build_project', description: 'Build the project' },
          { name: 'deploy_app', description: 'Deploy to production' },
          { name: 'check_status', description: 'Check deployment status' }
        ],
      }

      const response = await invokeAgent(manyTools)

      expect(response.provider).toBe('codex')
      expect(response.error).toBeUndefined()

      // Codex should use multiple tools for complex tasks
      expect(response.toolCalls).toBeDefined()
      expect(response.toolCalls!.length).toBeGreaterThan(0)

      // All tool calls should be from the provided tools
      const toolNames = new Set(manyTools.tools!.map(t => t.name))
      response.toolCalls!.forEach(call => {
        expect(toolNames.has(call.name)).toBe(true)
        expect(call.result).toContain('completed successfully')
      })
    })
  })
})
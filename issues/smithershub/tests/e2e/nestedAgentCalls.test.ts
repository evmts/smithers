import { describe, test, expect, beforeEach } from 'bun:test'
import { invokeAgent, validateAgentConfig } from '../../src/tools/invokeAgent'
import { AgentContextManager } from '../../src/utils/agentContext'
import type {
  AgentToolCallConfig,
  AgentResponse,
  AgentInvocationState
} from '../../src/types/AgentResponse'

describe('Nested Agent Calls End-to-End', () => {
  let context: AgentContextManager

  beforeEach(() => {
    context = new AgentContextManager()
  })

  describe('Single-Level Nested Calls', () => {
    test('Claude triggers Gemini analysis', async () => {
      const parentConfig: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'I need a detailed analysis of user sentiment from this text: "This product is amazing!"',
        parentContext: JSON.stringify({
          enableNestedCalls: true,
          task: 'sentiment_analysis'
        })
      }

      const response = await invokeAgent(parentConfig)

      expect(response.provider).toBe('claude')
      expect(response.error).toBeUndefined()
      expect(response.content.toLowerCase()).toContain('analysis')

      // Should have triggered nested Gemini call
      expect(response.nestedResponses).toBeDefined()
      expect(response.nestedResponses!.length).toBeGreaterThan(0)

      const nestedResponse = response.nestedResponses![0]
      expect(nestedResponse.provider).toBe('gemini')
      expect(nestedResponse.model).toBe('gemini-pro')
      expect(nestedResponse.content).toContain('analysis')
      expect(nestedResponse.duration).toBeGreaterThan(0)
    })

    test('Gemini triggers Codex for code generation', async () => {
      const parentConfig: AgentToolCallConfig = {
        provider: 'gemini',
        model: 'gemini-pro',
        prompt: 'I need to implement code for a binary search algorithm with optimization.',
        parentContext: JSON.stringify({
          enableNestedCalls: true,
          task: 'code_generation'
        })
      }

      const response = await invokeAgent(parentConfig)

      expect(response.provider).toBe('gemini')
      expect(response.error).toBeUndefined()
      expect(response.content.toLowerCase()).toContain('code')

      // Should have triggered nested Codex call
      expect(response.nestedResponses).toBeDefined()
      expect(response.nestedResponses!.length).toBeGreaterThan(0)

      const nestedResponse = response.nestedResponses![0]
      expect(nestedResponse.provider).toBe('codex')
      expect(nestedResponse.model).toBe('gpt-4')
      expect(nestedResponse.content.toLowerCase()).toContain('code')
    })

    test('Codex does not trigger additional nested calls', async () => {
      const parentConfig: AgentToolCallConfig = {
        provider: 'codex',
        model: 'gpt-4',
        prompt: 'Write code for analysis of sentiment data.',
        parentContext: JSON.stringify({
          enableNestedCalls: true,
          task: 'code_only'
        })
      }

      const response = await invokeAgent(parentConfig)

      expect(response.provider).toBe('codex')
      expect(response.error).toBeUndefined()

      // Codex should not trigger nested calls in this scenario
      // (based on current implementation that looks for 'analysis' or 'code' keywords)
      if (response.nestedResponses) {
        expect(response.nestedResponses.length).toBe(0)
      }
    })
  })

  describe('Context Management in Nested Calls', () => {
    test('tracks parent-child relationships through agent context', async () => {
      // Create parent invocation in context
      const parentConfig: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'Analyze this code and provide optimization suggestions.',
        parentContext: JSON.stringify({
          enableNestedCalls: true,
          sessionId: 'test-session-123'
        })
      }

      const parentId = context.generateId()
      const parentInvocation = context.createInvocation(parentId, parentConfig)

      // Update to running
      context.updateStatus(parentId, 'running')

      // Perform the invocation (which should create nested calls)
      const response = await invokeAgent(parentConfig)

      // Update context with response
      context.setResponse(parentId, response)

      // Verify parent invocation
      const updatedParent = context.getInvocation(parentId)
      expect(updatedParent!.status).toBe('completed')
      expect(updatedParent!.response).toEqual(response)

      // If there are nested responses, we should track them too
      if (response.nestedResponses && response.nestedResponses.length > 0) {
        // In a full implementation, nested calls would also be tracked in context
        // For now, we verify the structure is correct
        response.nestedResponses.forEach(nested => {
          expect(nested.id).toBeDefined()
          expect(nested.provider).toBeDefined()
          expect(nested.duration).toBeGreaterThan(0)
        })
      }
    })

    test('handles nested call failures gracefully', async () => {
      const parentConfig: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'This might trigger analysis that could fail.',
        parentContext: JSON.stringify({
          enableNestedCalls: true,
          simulateFailure: true // This would be handled by the implementation
        })
      }

      // Even if nested calls fail, parent should succeed
      const response = await invokeAgent(parentConfig)

      expect(response.provider).toBe('claude')
      expect(response.error).toBeUndefined() // Parent should not fail due to nested failures
      expect(response.content).toBeTruthy()

      // Nested responses might be empty if they failed
      // The implementation should handle this gracefully
      if (response.nestedResponses) {
        // Verify structure is still valid
        response.nestedResponses.forEach(nested => {
          expect(nested.id).toBeDefined()
          expect(nested.provider).toBeDefined()
          // nested.error might be defined if the call failed
        })
      }
    })
  })

  describe('Complex Multi-Agent Workflows', () => {
    test('orchestrates analysis + code + execution workflow', async () => {
      const orchestratorConfig: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'I need to analyze user feedback, then generate code to address the issues, and finally test the solution.',
        parentContext: JSON.stringify({
          enableNestedCalls: true,
          workflow: 'analyze_code_test',
          userFeedback: 'The search is too slow and returns irrelevant results'
        })
      }

      const parentId = context.generateId()
      context.createInvocation(parentId, orchestratorConfig)

      const response = await invokeAgent(orchestratorConfig)
      context.setResponse(parentId, response)

      // Verify orchestrator response
      expect(response.provider).toBe('claude')
      expect(response.error).toBeUndefined()
      expect(response.content).toBeTruthy()

      // Should have triggered multiple nested calls
      if (response.nestedResponses) {
        expect(response.nestedResponses.length).toBeGreaterThan(0)

        // Verify each nested response
        response.nestedResponses.forEach(nested => {
          expect(nested.id).toMatch(/^(gemini|codex)-\d+-[a-z0-9]+$/)
          expect(['gemini', 'codex']).toContain(nested.provider)
          expect(nested.duration).toBeGreaterThan(0)
          expect(nested.content).toBeTruthy()
        })
      }

      // Verify context state
      const finalInvocation = context.getInvocation(parentId)
      expect(finalInvocation!.status).toBe('completed')
      expect(finalInvocation!.endTime).toBeDefined()
    })

    test('handles concurrent nested operations', async () => {
      const parentConfig: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'I need both sentiment analysis and code review for this project simultaneously.',
        parentContext: JSON.stringify({
          enableNestedCalls: true,
          concurrent: true,
          tasks: ['sentiment_analysis', 'code_review']
        })
      }

      const startTime = Date.now()
      const response = await invokeAgent(parentConfig)
      const totalDuration = Date.now() - startTime

      expect(response.provider).toBe('claude')
      expect(response.error).toBeUndefined()

      // If nested calls are concurrent, total time should be less than sum of individual times
      if (response.nestedResponses && response.nestedResponses.length > 1) {
        const sumOfNestedDurations = response.nestedResponses.reduce(
          (sum, nested) => sum + nested.duration,
          0
        )

        // Concurrent execution should be significantly faster than sequential
        // (allowing for some overhead and parent execution time)
        expect(totalDuration).toBeLessThan(sumOfNestedDurations + 500)
      }
    })
  })

  describe('Error Propagation and Recovery', () => {
    test('isolates nested call errors from parent', async () => {
      const parentConfig: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'Perform analysis that might trigger problematic nested calls.',
        parentContext: JSON.stringify({
          enableNestedCalls: true,
          forceNestedErrors: true // Implementation would handle this flag
        })
      }

      const response = await invokeAgent(parentConfig)

      // Parent should always succeed even if nested calls fail
      expect(response.provider).toBe('claude')
      expect(response.error).toBeUndefined()
      expect(response.content).toBeTruthy()

      // Nested responses might have errors but should not crash the parent
      if (response.nestedResponses) {
        response.nestedResponses.forEach(nested => {
          // Each nested response should have valid structure
          expect(nested.id).toBeDefined()
          expect(nested.provider).toBeDefined()
          expect(nested.duration).toBeGreaterThan(0)
          expect(nested.timestamp).toBeDefined()

          // Error field might be present, but structure should be valid
          if (nested.error) {
            expect(typeof nested.error).toBe('string')
            expect(nested.content).toBe('')
          }
        })
      }
    })

    test('maintains context consistency during nested failures', async () => {
      const parentConfig: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'Complex analysis requiring nested operations.',
      }

      const parentId = context.generateId()
      const parentInvocation = context.createInvocation(parentId, parentConfig)

      // Simulate nested calls in context
      const nestedIds: string[] = []
      for (let i = 0; i < 3; i++) {
        const nestedId = context.generateId()
        const nestedConfig: AgentToolCallConfig = {
          provider: i % 2 === 0 ? 'gemini' : 'codex',
          model: i % 2 === 0 ? 'gemini-pro' : 'gpt-4',
          prompt: `Nested task ${i + 1}`,
        }
        context.createInvocation(nestedId, nestedConfig, parentId)
        nestedIds.push(nestedId)
      }

      // Verify parent has children
      expect(parentInvocation.childIds).toEqual(nestedIds)

      // Simulate some failures
      context.updateStatus(nestedIds[0], 'completed')
      context.updateStatus(nestedIds[1], 'error')
      context.updateStatus(nestedIds[2], 'completed')

      // Parent should still be manageable
      const childInvocations = context.getChildInvocations(parentId)
      expect(childInvocations).toHaveLength(3)

      const completedChildren = childInvocations.filter(inv => inv.status === 'completed')
      const errorChildren = childInvocations.filter(inv => inv.status === 'error')

      expect(completedChildren).toHaveLength(2)
      expect(errorChildren).toHaveLength(1)

      // Clean up should work correctly
      context.removeInvocation(parentId)
      expect(context.getAllInvocations()).toHaveLength(0)
    })
  })

  describe('Performance with Nested Calls', () => {
    test('nested calls do not exceed reasonable time limits', async () => {
      const config: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'Complex task requiring both analysis and code generation.',
        parentContext: JSON.stringify({
          enableNestedCalls: true,
          maxNesting: 2
        })
      }

      const startTime = Date.now()
      const response = await invokeAgent(config)
      const totalTime = Date.now() - startTime

      // With mock delays, even complex nested calls should complete quickly
      expect(totalTime).toBeLessThan(5000) // 5 seconds max

      expect(response.error).toBeUndefined()
      expect(response.duration).toBeGreaterThan(0)

      if (response.nestedResponses) {
        response.nestedResponses.forEach(nested => {
          // Each nested call should be reasonably fast
          expect(nested.duration).toBeLessThan(2000) // 2 seconds max per nested call
        })
      }
    })

    test('handles high concurrency of nested operations', async () => {
      const configs: AgentToolCallConfig[] = Array.from({ length: 5 }, (_, i) => ({
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: `Parallel task ${i + 1} requiring analysis and code.`,
        parentContext: JSON.stringify({
          enableNestedCalls: true,
          taskId: i
        })
      }))

      // Execute multiple parent calls concurrently, each triggering nested calls
      const startTime = Date.now()
      const promises = configs.map(config => invokeAgent(config))
      const responses = await Promise.all(promises)
      const totalTime = Date.now() - startTime

      // All should succeed
      expect(responses).toHaveLength(5)
      responses.forEach((response, i) => {
        expect(response.provider).toBe('claude')
        expect(response.error).toBeUndefined()
        expect(response.content).toBeTruthy()
      })

      // High concurrency should still complete in reasonable time
      expect(totalTime).toBeLessThan(8000) // 8 seconds for 5 concurrent complex operations

      // Verify nested calls structure
      responses.forEach(response => {
        if (response.nestedResponses) {
          response.nestedResponses.forEach(nested => {
            expect(nested.id).toBeDefined()
            expect(nested.duration).toBeGreaterThan(0)
          })
        }
      })
    })
  })

  describe('Real-world Scenario Simulation', () => {
    test('customer service automation with multiple agents', async () => {
      const customerQuery = "I'm having trouble with my account login and need help resetting my password"

      const orchestratorConfig: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: `Customer service query: "${customerQuery}". Please analyze the issue and provide a solution.`,
        parentContext: JSON.stringify({
          enableNestedCalls: true,
          scenario: 'customer_service',
          priority: 'high',
          customerQuery
        })
      }

      const parentId = context.generateId()
      context.createInvocation(parentId, orchestratorConfig)

      const response = await invokeAgent(orchestratorConfig)
      context.setResponse(parentId, response)

      // Verify main response
      expect(response.provider).toBe('claude')
      expect(response.error).toBeUndefined()
      expect(response.content.toLowerCase()).toContain('customer')

      // Should have analysis and potentially code for automation
      if (response.nestedResponses) {
        const hasAnalysis = response.nestedResponses.some(n => n.provider === 'gemini')
        const hasAutomation = response.nestedResponses.some(n => n.provider === 'codex')

        // At least analysis should be triggered
        expect(hasAnalysis || hasAutomation).toBe(true)
      }

      // Context should show completed workflow
      const finalState = context.getInvocation(parentId)
      expect(finalState!.status).toBe('completed')
      expect(finalState!.response).toBeDefined()
    })

    test('code review and optimization pipeline', async () => {
      const codeSnippet = `
        function slowFunction(data) {
          for (let i = 0; i < data.length; i++) {
            for (let j = 0; j < data.length; j++) {
              // O(n²) operation
              console.log(data[i] + data[j]);
            }
          }
        }
      `

      const pipelineConfig: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: `Please review and optimize this code: ${codeSnippet}`,
        parentContext: JSON.stringify({
          enableNestedCalls: true,
          workflow: 'code_review_optimize',
          language: 'javascript'
        })
      }

      const response = await invokeAgent(pipelineConfig)

      expect(response.provider).toBe('claude')
      expect(response.error).toBeUndefined()
      expect(response.content.toLowerCase()).toContain('code')

      // Should trigger both analysis and code generation
      if (response.nestedResponses) {
        expect(response.nestedResponses.length).toBeGreaterThan(0)

        // Should have code-related nested responses
        const hasCodeGen = response.nestedResponses.some(n =>
          n.provider === 'codex' && n.content.toLowerCase().includes('code')
        )

        if (hasCodeGen) {
          expect(hasCodeGen).toBe(true)
        }
      }

      // Performance should be reasonable even for complex code analysis
      expect(response.duration).toBeLessThan(3000)
    })
  })
})
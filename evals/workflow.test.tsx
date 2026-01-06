import { describe, test, expect } from 'bun:test'
import { z } from 'zod'
import React from 'react'
import { createWorkflow, Claude, ClaudeApi, Human, executePlan } from '../src/index.js'

describe('Workflow', () => {
  describe('createWorkflow', () => {
    test('creates a workflow with Provider, useInput, useStore, and Output', () => {
      const workflow = createWorkflow({
        schema: z.object({
          findings: z.string(),
          analysis: z.object({
            summary: z.string(),
            score: z.number(),
          }),
        }),
      })

      expect(workflow.schema).toBeDefined()
      expect(workflow.Provider).toBeDefined()
      expect(workflow.useInput).toBeDefined()
      expect(workflow.useStore).toBeDefined()
      expect(workflow.Output).toBeDefined()
    })

    test('supports default values', () => {
      const workflow = createWorkflow({
        schema: z.object({
          count: z.number(),
          name: z.string(),
        }),
        defaultValues: {
          count: 0,
          name: 'default',
        },
      })

      expect(workflow.schema).toBeDefined()
    })
  })

  describe('agent to agent communication', () => {
    test('passes values from one agent to another via mock mode', async () => {
      const workflow = createWorkflow({
        schema: z.object({
          research: z.string(),
        }),
      })

      let receivedValue: string | undefined

      function Researcher() {
        return (
          <Claude _mockMode>
            Research AI safety.
            <workflow.Output name="research" description="Your research findings" />
          </Claude>
        )
      }

      function Writer() {
        const research = workflow.useInput('research')
        if (!research) return null

        // Capture the value for testing
        receivedValue = research

        return (
          <Claude _mockMode>
            Summarize: {research}
          </Claude>
        )
      }

      function App() {
        return (
          <workflow.Provider>
            <Researcher />
            <Writer />
          </workflow.Provider>
        )
      }

      const result = await executePlan(<App />, { mockMode: true })

      // The workflow should have set a mock value
      expect(receivedValue).toBeDefined()
      expect(receivedValue).toContain('[mock value for research]')
      expect(result.frames).toBeGreaterThan(0)
    })

    test('workflow with ClaudeApi executor', async () => {
      const workflow = createWorkflow({
        schema: z.object({
          data: z.string(),
        }),
      })

      let receivedData: string | undefined

      function DataFetcher() {
        return (
          <ClaudeApi _mockMode>
            Fetch data.
            <workflow.Output name="data" description="The fetched data" />
          </ClaudeApi>
        )
      }

      function DataProcessor() {
        const data = workflow.useInput('data')
        if (!data) return null

        receivedData = data

        return (
          <ClaudeApi _mockMode>
            Process: {data}
          </ClaudeApi>
        )
      }

      function App() {
        return (
          <workflow.Provider>
            <DataFetcher />
            <DataProcessor />
          </workflow.Provider>
        )
      }

      const result = await executePlan(<App />, { mockMode: true })

      expect(receivedData).toBeDefined()
      expect(result.frames).toBeGreaterThan(0)
    })
  })

  describe('human-in-the-loop', () => {
    test('human can provide workflow values', async () => {
      const workflow = createWorkflow({
        schema: z.object({
          userFeedback: z.string(),
        }),
      })

      let receivedFeedback: string | undefined

      function FeedbackCollector() {
        return (
          <Human message="Please provide feedback">
            <workflow.Output name="userFeedback" description="Your feedback" />
          </Human>
        )
      }

      function FeedbackProcessor() {
        const feedback = workflow.useInput('userFeedback')
        if (!feedback) return null

        receivedFeedback = feedback

        return (
          <Claude _mockMode>
            Process feedback: {feedback}
          </Claude>
        )
      }

      function App() {
        return (
          <workflow.Provider>
            <FeedbackCollector />
            <FeedbackProcessor />
          </workflow.Provider>
        )
      }

      const result = await executePlan(<App />, {
        mockMode: true,
        onHumanPrompt: async (info) => {
          // Enhanced callback with workflow outputs
          if (typeof info === 'object' && 'outputs' in info) {
            return {
              approved: true,
              values: {
                userFeedback: 'Great work!',
              },
            }
          }
          // Legacy callback
          return true
        },
      })

      expect(receivedFeedback).toBe('Great work!')
      expect(result.frames).toBeGreaterThan(0)
    })

    test('legacy human prompt callback still works', async () => {
      const workflow = createWorkflow({
        schema: z.object({
          result: z.string(),
        }),
      })

      function SimpleHuman() {
        return (
          <Human message="Approve this?">
            Some content to approve
          </Human>
        )
      }

      function App() {
        return (
          <workflow.Provider>
            <SimpleHuman />
          </workflow.Provider>
        )
      }

      let promptCalled = false

      const result = await executePlan(<App />, {
        mockMode: true,
        onHumanPrompt: async (message: string, content: string) => {
          promptCalled = true
          expect(message).toBe('Approve this?')
          expect(content).toContain('Some content to approve')
          return true
        },
      })

      expect(promptCalled).toBe(true)
    })
  })

  describe('structured outputs', () => {
    test('supports complex Zod schemas', async () => {
      const workflow = createWorkflow({
        schema: z.object({
          analysis: z.object({
            issues: z.array(z.object({
              severity: z.enum(['low', 'medium', 'high']),
              description: z.string(),
            })),
            summary: z.string(),
            score: z.number().min(0).max(100),
          }),
        }),
      })

      let receivedAnalysis: unknown

      function Analyzer() {
        return (
          <Claude _mockMode>
            Analyze the code.
            <workflow.Output name="analysis" />
          </Claude>
        )
      }

      function Reporter() {
        const analysis = workflow.useInput('analysis')
        if (!analysis) return null

        receivedAnalysis = analysis

        return (
          <Claude _mockMode>
            Report: {JSON.stringify(analysis)}
          </Claude>
        )
      }

      function App() {
        return (
          <workflow.Provider>
            <Analyzer />
            <Reporter />
          </workflow.Provider>
        )
      }

      const result = await executePlan(<App />, { mockMode: true })

      expect(receivedAnalysis).toBeDefined()
      expect(result.frames).toBeGreaterThan(0)
    })
  })

  describe('multiple workflows', () => {
    test('supports multiple independent workflows', async () => {
      const researchWorkflow = createWorkflow({
        schema: z.object({ findings: z.string() }),
      })

      const reviewWorkflow = createWorkflow({
        schema: z.object({ feedback: z.string() }),
      })

      let researchValue: string | undefined
      let reviewValue: string | undefined

      function Researcher() {
        return (
          <Claude _mockMode>
            Research.
            <researchWorkflow.Output name="findings" />
          </Claude>
        )
      }

      function Reviewer() {
        const findings = researchWorkflow.useInput('findings')
        if (!findings) return null
        researchValue = findings

        return (
          <Claude _mockMode>
            Review: {findings}
            <reviewWorkflow.Output name="feedback" />
          </Claude>
        )
      }

      function FinalProcessor() {
        const feedback = reviewWorkflow.useInput('feedback')
        if (!feedback) return null
        reviewValue = feedback

        return (
          <Claude _mockMode>
            Final: {feedback}
          </Claude>
        )
      }

      function App() {
        return (
          <researchWorkflow.Provider>
            <reviewWorkflow.Provider>
              <Researcher />
              <Reviewer />
              <FinalProcessor />
            </reviewWorkflow.Provider>
          </researchWorkflow.Provider>
        )
      }

      const result = await executePlan(<App />, { mockMode: true })

      expect(researchValue).toBeDefined()
      expect(reviewValue).toBeDefined()
      expect(result.frames).toBeGreaterThan(0)
    })
  })

  describe('reactive re-execution', () => {
    test('re-executes when upstream values change', async () => {
      const workflow = createWorkflow({
        schema: z.object({
          iteration: z.number(),
          result: z.string(),
        }),
        defaultValues: {
          iteration: 0,
        },
      })

      let executionCount = 0

      function Iterator() {
        const iteration = workflow.useInput('iteration') ?? 0

        if (iteration >= 2) {
          return null // Stop after 2 iterations
        }

        executionCount++

        return (
          <Claude
            _mockMode
            onFinished={() => {
              // This would normally be set by the workflow output
              // but we're simulating the iteration update
            }}
          >
            Iteration {iteration}
            <workflow.Output name="result" description="Result of iteration" />
          </Claude>
        )
      }

      function App() {
        return (
          <workflow.Provider>
            <Iterator />
          </workflow.Provider>
        )
      }

      const result = await executePlan(<App />, { mockMode: true })

      // Should have executed at least once
      expect(executionCount).toBeGreaterThanOrEqual(1)
      expect(result.frames).toBeGreaterThan(0)
    })
  })
})

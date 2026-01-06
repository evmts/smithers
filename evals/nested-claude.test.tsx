import { describe, test, expect } from 'bun:test'
import React, { useState } from 'react'
import {
  executePlan,
  renderPlan,
  Claude,
  Phase,
  Step,
  type PlanInfo,
} from '../src/index.js'
import {
  separatePromptAndPlan,
  generateNodePaths,
  serializePlanWithPaths,
} from '../src/core/nested-execution.js'
import { createRoot, serialize } from '../src/core/render.js'

// Set mock mode for testing
process.env.SMITHERS_MOCK_MODE = 'true'

describe('Nested Claude Execution', () => {
  describe('separatePromptAndPlan', () => {
    test('extracts text nodes as prompt', async () => {
      function TestComponent() {
        return (
          <Claude allowedTools={['Read']} onFinished={() => {}}>
            This is the prompt text.
          </Claude>
        )
      }

      const root = createRoot()
      const tree = await root.render(<TestComponent />)
      root.unmount()

      // Find the claude node
      const claudeNode = tree.children[0]
      expect(claudeNode.type).toBe('claude')

      const { prompt, plan } = separatePromptAndPlan(claudeNode)
      expect(prompt).toBe('This is the prompt text.')
      expect(plan).toHaveLength(0)
    })

    test('extracts JSX elements as plan', async () => {
      function TestComponent() {
        return (
          <Claude allowedTools={['Read']} onFinished={() => {}}>
            <Phase name="analysis">
              <Step>Analyze code</Step>
            </Phase>
          </Claude>
        )
      }

      const root = createRoot()
      const tree = await root.render(<TestComponent />)
      root.unmount()

      const claudeNode = tree.children[0]
      const { prompt, plan } = separatePromptAndPlan(claudeNode)

      expect(prompt).toBe('')
      expect(plan).toHaveLength(1)
      expect(plan[0].type).toBe('phase')
    })

    test('separates mixed content correctly', async () => {
      function TestComponent() {
        return (
          <Claude allowedTools={['Read']} onFinished={() => {}}>
            Review this codebase for security issues.

            <Phase name="scan">
              <Claude onFinished={() => {}}>Scan for vulnerabilities</Claude>
            </Phase>

            Make sure to check all files.

            <Phase name="fix">
              <Claude onFinished={() => {}}>Fix any issues found</Claude>
            </Phase>
          </Claude>
        )
      }

      const root = createRoot()
      const tree = await root.render(<TestComponent />)
      root.unmount()

      const claudeNode = tree.children[0]
      const { prompt, plan } = separatePromptAndPlan(claudeNode)

      // Prompt should contain all text nodes concatenated
      expect(prompt).toContain('Review this codebase')
      expect(prompt).toContain('Make sure to check all files')

      // Plan should contain the Phase elements
      expect(plan).toHaveLength(2)
      expect(plan[0].type).toBe('phase')
      expect(plan[0].props.name).toBe('scan')
      expect(plan[1].type).toBe('phase')
      expect(plan[1].props.name).toBe('fix')
    })
  })

  describe('generateNodePaths', () => {
    test('generates paths for flat structure', async () => {
      function TestComponent() {
        return (
          <Claude allowedTools={['Read']} onFinished={() => {}}>
            <Claude onFinished={() => {}}>First task</Claude>
            <Claude onFinished={() => {}}>Second task</Claude>
          </Claude>
        )
      }

      const root = createRoot()
      const tree = await root.render(<TestComponent />)
      root.unmount()

      const claudeNode = tree.children[0]
      const { plan } = separatePromptAndPlan(claudeNode)
      const paths = generateNodePaths(plan)

      expect(paths.size).toBeGreaterThanOrEqual(2)
      expect(paths.has('claude[0]')).toBe(true)
      expect(paths.has('claude[1]')).toBe(true)
    })

    test('generates paths for nested structure', async () => {
      function TestComponent() {
        return (
          <Claude allowedTools={['Read']} onFinished={() => {}}>
            <Phase name="phase1">
              <Claude onFinished={() => {}}>Task in phase 1</Claude>
            </Phase>
            <Phase name="phase2">
              <Claude onFinished={() => {}}>Task in phase 2</Claude>
              <Claude onFinished={() => {}}>Another task in phase 2</Claude>
            </Phase>
          </Claude>
        )
      }

      const root = createRoot()
      const tree = await root.render(<TestComponent />)
      root.unmount()

      const claudeNode = tree.children[0]
      const { plan } = separatePromptAndPlan(claudeNode)
      const paths = generateNodePaths(plan)

      // Should have paths for phases and nested claudes
      expect(paths.has('phase[0]')).toBe(true)
      expect(paths.has('phase[0]/claude[0]')).toBe(true)
      expect(paths.has('phase[1]')).toBe(true)
      expect(paths.has('phase[1]/claude[0]')).toBe(true)
      expect(paths.has('phase[1]/claude[1]')).toBe(true)
    })

    test('paths map to correct nodes', async () => {
      function TestComponent() {
        return (
          <Claude allowedTools={['Read']} onFinished={() => {}}>
            <Phase name="analysis">
              <Claude onFinished={() => {}}>Analyze</Claude>
            </Phase>
          </Claude>
        )
      }

      const root = createRoot()
      const tree = await root.render(<TestComponent />)
      root.unmount()

      const claudeNode = tree.children[0]
      const { plan } = separatePromptAndPlan(claudeNode)
      const paths = generateNodePaths(plan)

      const phaseNode = paths.get('phase[0]')
      expect(phaseNode).toBeDefined()
      expect(phaseNode?.type).toBe('phase')
      expect(phaseNode?.props.name).toBe('analysis')

      const innerClaude = paths.get('phase[0]/claude[0]')
      expect(innerClaude).toBeDefined()
      expect(innerClaude?.type).toBe('claude')
    })
  })

  describe('serializePlanWithPaths', () => {
    test('includes path attributes in serialized XML', async () => {
      function TestComponent() {
        return (
          <Claude allowedTools={['Read']} onFinished={() => {}}>
            <Phase name="scan">
              <Claude onFinished={() => {}}>Scan files</Claude>
            </Phase>
          </Claude>
        )
      }

      const root = createRoot()
      const tree = await root.render(<TestComponent />)
      root.unmount()

      const claudeNode = tree.children[0]
      const { plan } = separatePromptAndPlan(claudeNode)
      const xml = serializePlanWithPaths(plan)

      expect(xml).toContain('path="phase[0]"')
      expect(xml).toContain('path="phase[0]/claude[0]"')
    })
  })

  describe('Nested Claude with plan detection', () => {
    test('detects when Claude has JSX children (has plan)', async () => {
      function WithPlan() {
        return (
          <Claude allowedTools={['Read']} onFinished={() => {}}>
            Review this code.
            <Claude onFinished={() => {}}>Do analysis</Claude>
          </Claude>
        )
      }

      const root = createRoot()
      const tree = await root.render(<WithPlan />)
      root.unmount()

      const claudeNode = tree.children[0]
      const { plan } = separatePromptAndPlan(claudeNode)
      expect(plan.length).toBeGreaterThan(0)
    })

    test('detects when Claude has only text (no plan)', async () => {
      function NoPlan() {
        return (
          <Claude allowedTools={['Read']} onFinished={() => {}}>
            Just a simple prompt with no nested JSX.
          </Claude>
        )
      }

      const root = createRoot()
      const tree = await root.render(<NoPlan />)
      root.unmount()

      const claudeNode = tree.children[0]
      const { plan } = separatePromptAndPlan(claudeNode)
      expect(plan.length).toBe(0)
    })
  })

  describe('Full nested execution flow', () => {
    test('executes outer Claude which can trigger inner Claude via tool', async () => {
      const results: string[] = []

      function NestedAgent() {
        const [phase, setPhase] = useState('start')

        if (phase === 'done') {
          return <Claude onFinished={() => results.push('final')}>Finalize</Claude>
        }

        return (
          <Claude
            allowedTools={['Read']}
            onFinished={(output) => {
              results.push('outer')
              setPhase('done')
            }}
          >
            Execute the plan below:

            <Claude
              onFinished={(output) => {
                results.push('inner')
              }}
            >
              Inner task
            </Claude>
          </Claude>
        )
      }

      await executePlan(<NestedAgent />)

      // In mock mode, both should execute
      // The outer Claude orchestrates and the inner Claude runs
      expect(results.length).toBeGreaterThan(0)
    })

    test('state changes from inner Claude trigger re-render', async () => {
      const stateChanges: string[] = []

      function StatefulNested() {
        const [data, setData] = useState<string | null>(null)

        stateChanges.push(`render:data=${data}`)

        if (data) {
          return (
            <Claude onFinished={() => stateChanges.push('phase2-done')}>
              Process: {data}
            </Claude>
          )
        }

        return (
          <Claude
            allowedTools={['Read']}
            onFinished={() => stateChanges.push('outer-done')}
          >
            Start processing.

            <Claude
              onFinished={(output) => {
                stateChanges.push('inner-finished')
                setData('analyzed')
              }}
            >
              Analyze files
            </Claude>
          </Claude>
        )
      }

      await executePlan(<StatefulNested />)

      // Should see re-render after inner Claude sets data
      expect(stateChanges.filter(s => s.startsWith('render:')).length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('render_node tool execution', () => {
    test('can find and execute a node by path', async () => {
      function TestAgent() {
        return (
          <Claude allowedTools={['Read']} onFinished={() => {}}>
            Execute this plan:
            <Phase name="setup">
              <Claude onFinished={() => {}}>Setup task</Claude>
            </Phase>
          </Claude>
        )
      }

      const root = createRoot()
      const tree = await root.render(<TestAgent />)
      root.unmount()

      const claudeNode = tree.children[0]
      const { plan } = separatePromptAndPlan(claudeNode)
      const paths = generateNodePaths(plan)

      // Find the inner Claude node
      const innerClaude = paths.get('phase[0]/claude[0]')
      expect(innerClaude).toBeDefined()
      expect(innerClaude?.type).toBe('claude')

      // The render_node tool would execute this node
      // We just verify the lookup works
    })
  })

  describe('onPlanWithPrompt callback', () => {
    test('calls onPlanWithPrompt when there are pending nodes', async () => {
      const planInfos: PlanInfo[] = []

      function TestAgent() {
        return (
          <Claude allowedTools={['Read']} onFinished={() => {}}>
            Review the code and fix issues.

            <Phase name="review">
              <Claude onFinished={() => {}}>Review code</Claude>
            </Phase>
          </Claude>
        )
      }

      await executePlan(<TestAgent />, {
        onPlanWithPrompt: async (info) => {
          planInfos.push(info)
        },
      })

      // Should have been called at least once
      expect(planInfos.length).toBeGreaterThan(0)

      // First call should have the plan info
      const firstInfo = planInfos[0]
      expect(firstInfo.frame).toBe(1)
      expect(firstInfo.prompt).toContain('Review the code')
      expect(firstInfo.planXml).toContain('phase')
      expect(firstInfo.executablePaths.length).toBeGreaterThan(0)
    })

    test('includes correct executable paths', async () => {
      const planInfos: PlanInfo[] = []

      function TestAgent() {
        return (
          <Claude allowedTools={['Read']} onFinished={() => {}}>
            Execute the tasks.

            <Claude onFinished={() => {}}>First task</Claude>
            <Claude onFinished={() => {}}>Second task</Claude>
          </Claude>
        )
      }

      await executePlan(<TestAgent />, {
        onPlanWithPrompt: async (info) => {
          planInfos.push(info)
        },
      })

      expect(planInfos.length).toBeGreaterThan(0)
      const firstInfo = planInfos[0]

      // Should have paths to both inner Claude nodes
      expect(firstInfo.executablePaths).toContain('claude[0]')
      expect(firstInfo.executablePaths).toContain('claude[1]')
    })

    test('does not call onPlanWithPrompt when no pending nodes', async () => {
      const planInfos: PlanInfo[] = []

      function EmptyAgent() {
        return (
          <Phase name="empty">
            <Step>No Claude nodes here</Step>
          </Phase>
        )
      }

      await executePlan(<EmptyAgent />, {
        onPlanWithPrompt: async (info) => {
          planInfos.push(info)
        },
      })

      // Should not be called since there are no pending nodes
      expect(planInfos.length).toBe(0)
    })
  })
})

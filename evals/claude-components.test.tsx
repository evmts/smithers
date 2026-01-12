import { describe, test, expect } from 'bun:test'
import React from 'react'
import {
  executePlan,
  renderPlan,
  Claude,
  ClaudeApi,
} from '@evmts/smithers'

// Set mock mode for testing
process.env.SMITHERS_MOCK_MODE = 'true'

describe('Claude Components', () => {
  describe('Claude (Agent SDK)', () => {
    test('renders as claude node type', async () => {
      function SimpleAgent() {
        return (
          <Claude allowedTools={['Read', 'Edit']} onFinished={() => {}}>
            Fix the bug
          </Claude>
        )
      }

      const plan = await renderPlan(<SimpleAgent />)

      expect(plan).toContain('<claude')
      expect(plan).toContain('Fix the bug')
    })

    test('executes with mock mode', async () => {
      let result: unknown = null

      function SimpleAgent() {
        return (
          <Claude
            allowedTools={['Read', 'Edit']}
            permissionMode="acceptEdits"
            onFinished={(output) => {
              result = output
            }}
          >
            Fix the bug in auth.py
          </Claude>
        )
      }

      await executePlan(<SimpleAgent />)

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
    })

    test('supports all Agent SDK props', async () => {
      function AdvancedAgent() {
        return (
          <Claude
            allowedTools={['Read', 'Edit', 'Bash']}
            disallowedTools={['WebSearch']}
            permissionMode="acceptEdits"
            maxTurns={5}
            maxBudgetUsd={1.0}
            systemPrompt="You are a helpful assistant"
            cwd="/tmp"
            agents={{
              'code-reviewer': {
                description: 'Reviews code',
                prompt: 'You are a code reviewer',
                tools: ['Read'],
              },
            }}
            onFinished={() => {}}
          >
            Analyze the codebase
          </Claude>
        )
      }

      const plan = await renderPlan(<AdvancedAgent />)

      expect(plan).toContain('<claude')
      expect(plan).toContain('Analyze the codebase')
    })
  })

  describe('ClaudeApi (API SDK)', () => {
    test('renders as claude-api node type', async () => {
      function ApiAgent() {
        return (
          <ClaudeApi tools={[]} onFinished={() => {}}>
            Analyze this
          </ClaudeApi>
        )
      }

      const plan = await renderPlan(<ApiAgent />)

      expect(plan).toContain('<claude-api')
      expect(plan).toContain('Analyze this')
    })

    test('executes with mock mode', async () => {
      let result: unknown = null

      function ApiAgent() {
        return (
          <ClaudeApi
            tools={[]}
            onFinished={(output) => {
              result = output
            }}
          >
            Hello world
          </ClaudeApi>
        )
      }

      await executePlan(<ApiAgent />)

      expect(result).toBeDefined()
    })
  })

  describe('Both components coexist', () => {
    test('can use both Claude and ClaudeApi in same tree', async () => {
      const results: string[] = []

      function MixedAgent() {
        return (
          <>
            <Claude
              allowedTools={['Read']}
              onFinished={() => results.push('agent-sdk')}
            >
              Agent SDK task
            </Claude>
            <ClaudeApi
              tools={[]}
              onFinished={() => results.push('api-sdk')}
            >
              API SDK task
            </ClaudeApi>
          </>
        )
      }

      await executePlan(<MixedAgent />)

      expect(results).toContain('agent-sdk')
      expect(results).toContain('api-sdk')
    })
  })
})

import { describe, test, expect, jest, beforeEach } from 'bun:test'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { Window } from 'happy-dom'
import type { AgentToolCallConfig, AgentResponse } from '../../src/types/AgentResponse'

// Setup DOM environment for React testing
const window = new Window()
const document = window.document
global.window = window as any
global.document = document as any
global.HTMLElement = window.HTMLElement as any
global.Element = window.Element as any
global.Node = window.Node as any

// Mock the invokeAgent function
const mockInvokeAgent = jest.fn<Promise<AgentResponse>, [AgentToolCallConfig]>()

// Mock AgentInvoker component interface since we're testing behavior first
interface AgentInvokerProps {
  onInvokeStart?: (config: AgentToolCallConfig) => void
  onInvokeComplete?: (response: AgentResponse) => void
  onInvokeError?: (error: string) => void
  disabled?: boolean
  children: (params: {
    invoke: (config: AgentToolCallConfig) => Promise<void>
    isInvoking: boolean
    lastResponse: AgentResponse | null
    error: string | null
  }) => React.ReactNode
}

// Mock component implementation for testing
const MockAgentInvoker: React.FC<AgentInvokerProps> = ({
  onInvokeStart,
  onInvokeComplete,
  onInvokeError,
  disabled = false,
  children
}) => {
  const [isInvoking, setIsInvoking] = React.useState(false)
  const [lastResponse, setLastResponse] = React.useState<AgentResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const invoke = async (config: AgentToolCallConfig) => {
    if (disabled || isInvoking) return

    try {
      setIsInvoking(true)
      setError(null)
      onInvokeStart?.(config)

      const response = await mockInvokeAgent(config)

      if (response.error) {
        setError(response.error)
        onInvokeError?.(response.error)
      } else {
        setLastResponse(response)
        onInvokeComplete?.(response)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMsg)
      onInvokeError?.(errorMsg)
    } finally {
      setIsInvoking(false)
    }
  }

  return (
    <div>
      {children({ invoke, isInvoking, lastResponse, error })}
    </div>
  )
}

describe('AgentInvoker Component', () => {
  beforeEach(() => {
    mockInvokeAgent.mockClear()
  })

  describe('Basic Rendering and State', () => {
    test('renders children with initial state', () => {
      render(
        <MockAgentInvoker>
          {({ isInvoking, lastResponse, error }) => (
            <div>
              <div data-testid="invoking">{isInvoking ? 'true' : 'false'}</div>
              <div data-testid="response">{lastResponse ? 'has-response' : 'no-response'}</div>
              <div data-testid="error">{error || 'no-error'}</div>
            </div>
          )}
        </MockAgentInvoker>
      )

      expect(screen.getByTestId('invoking')).toHaveTextContent('false')
      expect(screen.getByTestId('response')).toHaveTextContent('no-response')
      expect(screen.getByTestId('error')).toHaveTextContent('no-error')
    })

    test('provides invoke function to children', () => {
      let capturedInvoke: ((config: AgentToolCallConfig) => Promise<void>) | null = null

      render(
        <MockAgentInvoker>
          {({ invoke }) => {
            capturedInvoke = invoke
            return <div>Component rendered</div>
          }}
        </MockAgentInvoker>
      )

      expect(capturedInvoke).toBeInstanceOf(Function)
    })
  })

  describe('Agent Invocation Flow', () => {
    test('handles successful Claude invocation', async () => {
      const mockResponse: AgentResponse = {
        id: 'claude-123',
        provider: 'claude',
        model: 'claude-3-sonnet',
        content: 'Test response from Claude',
        duration: 500,
        timestamp: new Date().toISOString(),
      }

      mockInvokeAgent.mockResolvedValue(mockResponse)

      const onInvokeStart = jest.fn()
      const onInvokeComplete = jest.fn()

      let invokeFunction: ((config: AgentToolCallConfig) => Promise<void>) | null = null

      render(
        <MockAgentInvoker
          onInvokeStart={onInvokeStart}
          onInvokeComplete={onInvokeComplete}
        >
          {({ invoke, isInvoking, lastResponse }) => {
            invokeFunction = invoke
            return (
              <div>
                <button
                  onClick={() => invoke({
                    provider: 'claude',
                    model: 'claude-3-sonnet',
                    prompt: 'Hello Claude'
                  })}
                  disabled={isInvoking}
                  data-testid="invoke-button"
                >
                  {isInvoking ? 'Invoking...' : 'Invoke Claude'}
                </button>
                {lastResponse && (
                  <div data-testid="response-content">{lastResponse.content}</div>
                )}
              </div>
            )
          }}
        </MockAgentInvoker>
      )

      const button = screen.getByTestId('invoke-button')
      expect(button).toHaveTextContent('Invoke Claude')
      expect(button).not.toBeDisabled()

      fireEvent.click(button)

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByTestId('invoke-button')).toHaveTextContent('Invoking...')
      })

      // Wait for completion
      await waitFor(() => {
        expect(screen.getByTestId('response-content')).toHaveTextContent('Test response from Claude')
      })

      expect(onInvokeStart).toHaveBeenCalledWith({
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'Hello Claude'
      })

      expect(onInvokeComplete).toHaveBeenCalledWith(mockResponse)
      expect(screen.getByTestId('invoke-button')).toHaveTextContent('Invoke Claude')
    })

    test('handles Gemini invocation with structured response', async () => {
      const mockResponse: AgentResponse = {
        id: 'gemini-456',
        provider: 'gemini',
        model: 'gemini-pro',
        content: 'Gemini analysis complete',
        structured: JSON.stringify({ confidence: 0.95, type: 'analysis' }),
        usage: {
          promptTokens: 20,
          completionTokens: 50,
          totalTokens: 70
        },
        duration: 750,
        timestamp: new Date().toISOString(),
      }

      mockInvokeAgent.mockResolvedValue(mockResponse)

      const onInvokeComplete = jest.fn()

      render(
        <MockAgentInvoker onInvokeComplete={onInvokeComplete}>
          {({ invoke, lastResponse }) => (
            <div>
              <button
                onClick={() => invoke({
                  provider: 'gemini',
                  model: 'gemini-pro',
                  prompt: 'Analyze this data'
                })}
                data-testid="invoke-gemini"
              >
                Invoke Gemini
              </button>
              {lastResponse && (
                <div>
                  <div data-testid="content">{lastResponse.content}</div>
                  <div data-testid="structured">{lastResponse.structured}</div>
                  <div data-testid="usage">
                    {lastResponse.usage?.totalTokens} tokens
                  </div>
                </div>
              )}
            </div>
          )}
        </MockAgentInvoker>
      )

      fireEvent.click(screen.getByTestId('invoke-gemini'))

      await waitFor(() => {
        expect(screen.getByTestId('content')).toHaveTextContent('Gemini analysis complete')
      })

      expect(screen.getByTestId('structured')).toHaveTextContent('{"confidence":0.95,"type":"analysis"}')
      expect(screen.getByTestId('usage')).toHaveTextContent('70 tokens')
      expect(onInvokeComplete).toHaveBeenCalledWith(mockResponse)
    })

    test('handles Codex invocation with tool calls', async () => {
      const mockResponse: AgentResponse = {
        id: 'codex-789',
        provider: 'codex',
        model: 'gpt-4',
        content: 'Generated code solution',
        toolCalls: [
          {
            name: 'run_code',
            arguments: JSON.stringify({ code: 'function test() { return true; }' }),
            result: 'Code executed successfully'
          }
        ],
        duration: 1200,
        timestamp: new Date().toISOString(),
      }

      mockInvokeAgent.mockResolvedValue(mockResponse)

      render(
        <MockAgentInvoker>
          {({ invoke, lastResponse }) => (
            <div>
              <button
                onClick={() => invoke({
                  provider: 'codex',
                  model: 'gpt-4',
                  prompt: 'Write a test function',
                  tools: [{ name: 'run_code', description: 'Execute code' }]
                })}
                data-testid="invoke-codex"
              >
                Invoke Codex
              </button>
              {lastResponse?.toolCalls && (
                <div data-testid="tool-calls">
                  {lastResponse.toolCalls.map((call, i) => (
                    <div key={i} data-testid={`tool-${call.name}`}>
                      {call.name}: {call.result}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </MockAgentInvoker>
      )

      fireEvent.click(screen.getByTestId('invoke-codex'))

      await waitFor(() => {
        expect(screen.getByTestId('tool-run_code')).toHaveTextContent('run_code: Code executed successfully')
      })
    })
  })

  describe('Error Handling', () => {
    test('handles API errors gracefully', async () => {
      const errorResponse: AgentResponse = {
        id: 'error-123',
        provider: 'claude',
        model: 'claude-3-sonnet',
        content: '',
        error: 'API rate limit exceeded',
        duration: 100,
        timestamp: new Date().toISOString(),
      }

      mockInvokeAgent.mockResolvedValue(errorResponse)

      const onInvokeError = jest.fn()

      render(
        <MockAgentInvoker onInvokeError={onInvokeError}>
          {({ invoke, error, isInvoking }) => (
            <div>
              <button
                onClick={() => invoke({
                  provider: 'claude',
                  model: 'claude-3-sonnet',
                  prompt: 'Test prompt'
                })}
                data-testid="invoke-button"
                disabled={isInvoking}
              >
                Invoke
              </button>
              {error && <div data-testid="error-display">{error}</div>}
            </div>
          )}
        </MockAgentInvoker>
      )

      fireEvent.click(screen.getByTestId('invoke-button'))

      await waitFor(() => {
        expect(screen.getByTestId('error-display')).toHaveTextContent('API rate limit exceeded')
      })

      expect(onInvokeError).toHaveBeenCalledWith('API rate limit exceeded')
    })

    test('handles network errors', async () => {
      mockInvokeAgent.mockRejectedValue(new Error('Network connection failed'))

      const onInvokeError = jest.fn()

      render(
        <MockAgentInvoker onInvokeError={onInvokeError}>
          {({ invoke, error }) => (
            <div>
              <button
                onClick={() => invoke({
                  provider: 'gemini',
                  model: 'gemini-pro',
                  prompt: 'Test'
                })}
                data-testid="invoke-button"
              >
                Invoke
              </button>
              {error && <div data-testid="error">{error}</div>}
            </div>
          )}
        </MockAgentInvoker>
      )

      fireEvent.click(screen.getByTestId('invoke-button'))

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Network connection failed')
      })

      expect(onInvokeError).toHaveBeenCalledWith('Network connection failed')
    })
  })

  describe('Component State Management', () => {
    test('prevents multiple simultaneous invocations', async () => {
      // Create a slow mock response
      const slowResponse: Promise<AgentResponse> = new Promise(resolve =>
        setTimeout(() => resolve({
          id: 'slow-response',
          provider: 'claude',
          model: 'claude-3-sonnet',
          content: 'Slow response',
          duration: 1000,
          timestamp: new Date().toISOString(),
        }), 100)
      )

      mockInvokeAgent.mockReturnValue(slowResponse)

      render(
        <MockAgentInvoker>
          {({ invoke, isInvoking }) => (
            <div>
              <button
                onClick={() => invoke({
                  provider: 'claude',
                  model: 'claude-3-sonnet',
                  prompt: 'First call'
                })}
                data-testid="first-button"
                disabled={isInvoking}
              >
                First Call
              </button>
              <button
                onClick={() => invoke({
                  provider: 'claude',
                  model: 'claude-3-sonnet',
                  prompt: 'Second call'
                })}
                data-testid="second-button"
                disabled={isInvoking}
              >
                Second Call
              </button>
              <div data-testid="status">{isInvoking ? 'invoking' : 'idle'}</div>
            </div>
          )}
        </MockAgentInvoker>
      )

      // Click first button
      fireEvent.click(screen.getByTestId('first-button'))

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('invoking')
      })

      // Both buttons should be disabled during invocation
      expect(screen.getByTestId('first-button')).toBeDisabled()
      expect(screen.getByTestId('second-button')).toBeDisabled()

      // Wait for completion
      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('idle')
      }, { timeout: 2000 })

      // Should have been called only once
      expect(mockInvokeAgent).toHaveBeenCalledTimes(1)
    })

    test('respects disabled prop', () => {
      render(
        <MockAgentInvoker disabled={true}>
          {({ invoke, isInvoking }) => (
            <button
              onClick={() => invoke({
                provider: 'claude',
                model: 'claude-3-sonnet',
                prompt: 'Test'
              })}
              data-testid="disabled-button"
            >
              Invoke
            </button>
          )}
        </MockAgentInvoker>
      )

      fireEvent.click(screen.getByTestId('disabled-button'))

      // Should not have called the mock function
      expect(mockInvokeAgent).not.toHaveBeenCalled()
    })
  })

  describe('Nested Agent Responses', () => {
    test('displays nested responses correctly', async () => {
      const nestedResponse: AgentResponse = {
        id: 'nested-123',
        provider: 'gemini',
        model: 'gemini-pro',
        content: 'Nested analysis result',
        duration: 300,
        timestamp: new Date().toISOString(),
      }

      const parentResponse: AgentResponse = {
        id: 'parent-456',
        provider: 'claude',
        model: 'claude-3-sonnet',
        content: 'Parent response with nested calls',
        nestedResponses: [nestedResponse],
        duration: 800,
        timestamp: new Date().toISOString(),
      }

      mockInvokeAgent.mockResolvedValue(parentResponse)

      render(
        <MockAgentInvoker>
          {({ invoke, lastResponse }) => (
            <div>
              <button
                onClick={() => invoke({
                  provider: 'claude',
                  model: 'claude-3-sonnet',
                  prompt: 'Complex task requiring nested calls'
                })}
                data-testid="invoke-nested"
              >
                Invoke with Nesting
              </button>
              {lastResponse && (
                <div>
                  <div data-testid="parent-content">{lastResponse.content}</div>
                  {lastResponse.nestedResponses?.map((nested, i) => (
                    <div key={i} data-testid={`nested-${i}`}>
                      {nested.provider}: {nested.content}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </MockAgentInvoker>
      )

      fireEvent.click(screen.getByTestId('invoke-nested'))

      await waitFor(() => {
        expect(screen.getByTestId('parent-content')).toHaveTextContent('Parent response with nested calls')
        expect(screen.getByTestId('nested-0')).toHaveTextContent('gemini: Nested analysis result')
      })
    })
  })
})
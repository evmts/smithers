/**
 * AgentInvoker - React component for invoking agents as tools
 * Provides a render prop pattern for maximum flexibility in UI presentation
 * Uses useRef for state management per project guidelines (no useState)
 */

import React, { useRef } from 'react'
import { invokeAgent, validateAgentConfig } from '../tools/invokeAgent'
import { useAgentContext, type AgentContextManager } from '../utils/agentContext'
import type {
  AgentToolCallConfig,
  AgentResponse,
  AgentInvocationState
} from '../types/AgentResponse'

export interface AgentInvokerProps {
  /** Called when an agent invocation starts */
  onInvokeStart?: (config: AgentToolCallConfig, invocationId: string) => void
  /** Called when an agent invocation completes successfully */
  onInvokeComplete?: (response: AgentResponse, invocationId: string) => void
  /** Called when an agent invocation fails */
  onInvokeError?: (error: string, invocationId: string) => void
  /** Whether the component is disabled */
  disabled?: boolean
  /** Parent invocation ID for nested calls */
  parentInvocationId?: string
  /** Agent context manager (optional, uses default if not provided) */
  agentContext?: AgentContextManager
  /** Children render prop - provides invocation functions and state */
  children: (params: {
    invoke: (config: AgentToolCallConfig) => Promise<void>
    isInvoking: boolean
    lastResponse: AgentResponse | null
    lastInvocation: AgentInvocationState | null
    error: string | null
    validateConfig: (config: AgentToolCallConfig) => string[]
    activeInvocations: AgentInvocationState[]
  }) => React.ReactNode
}

/**
 * AgentInvoker component using render prop pattern
 * Manages agent invocations and provides state through render props
 */
export function AgentInvoker({
  onInvokeStart,
  onInvokeComplete,
  onInvokeError,
  disabled = false,
  parentInvocationId,
  agentContext: providedContext,
  children
}: AgentInvokerProps): React.ReactElement {
  // Use provided context or create default one
  const defaultContext = useAgentContext()
  const context = providedContext || defaultContext

  // State management using useRef (no useState per project guidelines)
  const stateRef = useRef({
    isInvoking: false,
    lastResponse: null as AgentResponse | null,
    lastInvocation: null as AgentInvocationState | null,
    error: null as string | null,
    forceUpdateCounter: 0
  })

  // Force re-render function (replaces useState pattern)
  const forceUpdateRef = useRef<() => void>()
  if (!forceUpdateRef.current) {
    forceUpdateRef.current = () => {
      stateRef.current.forceUpdateCounter++
      // This creates a new reference to trigger re-render
      stateRef.current = { ...stateRef.current }
    }
  }

  const invoke = async (config: AgentToolCallConfig): Promise<void> => {
    // Prevent multiple simultaneous invocations
    if (disabled || stateRef.current.isInvoking) {
      return
    }

    // Validate configuration first
    const validationErrors = validateAgentConfig(config)
    if (validationErrors.length > 0) {
      const errorMsg = `Configuration validation failed: ${validationErrors.join(', ')}`
      stateRef.current.error = errorMsg
      forceUpdateRef.current?.()
      onInvokeError?.(errorMsg, '')
      return
    }

    // Generate invocation ID and create state
    const invocationId = context.generateId()

    try {
      // Update state to show invocation started
      stateRef.current.isInvoking = true
      stateRef.current.error = null
      forceUpdateRef.current?.()

      // Create invocation in context
      const invocation = context.createInvocation(invocationId, config, parentInvocationId)
      stateRef.current.lastInvocation = invocation

      // Update context status to running
      context.updateStatus(invocationId, 'running')

      // Notify start
      onInvokeStart?.(config, invocationId)

      // Perform the actual agent invocation
      const response = await invokeAgent(config)

      // Update context with response
      context.setResponse(invocationId, response)

      if (response.error) {
        // Handle API-level errors
        stateRef.current.error = response.error
        onInvokeError?.(response.error, invocationId)
      } else {
        // Success case
        stateRef.current.lastResponse = response
        stateRef.current.lastInvocation = context.getInvocation(invocationId) || invocation
        onInvokeComplete?.(response, invocationId)
      }

    } catch (error) {
      // Handle unexpected errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      stateRef.current.error = errorMessage

      // Update context with error
      context.updateStatus(invocationId, 'error')

      onInvokeError?.(errorMessage, invocationId)

    } finally {
      // Always reset invoking state
      stateRef.current.isInvoking = false
      forceUpdateRef.current?.()
    }
  }

  // Get active invocations from context
  const activeInvocations = context.getActiveInvocations()

  return (
    <>
      {children({
        invoke,
        isInvoking: stateRef.current.isInvoking,
        lastResponse: stateRef.current.lastResponse,
        lastInvocation: stateRef.current.lastInvocation,
        error: stateRef.current.error,
        validateConfig: validateAgentConfig,
        activeInvocations,
      })}
    </>
  )
}

/**
 * Simple example usage component demonstrating brutal terminal aesthetic
 * Shows how to use AgentInvoker in practice
 */
export interface SimpleAgentUIProps {
  /** Optional agent context manager */
  agentContext?: AgentContextManager
  /** Optional callback for when agent responds */
  onResponse?: (response: AgentResponse) => void
}

export function SimpleAgentUI({
  agentContext,
  onResponse
}: SimpleAgentUIProps): React.ReactElement {
  const promptRef = useRef<HTMLInputElement>(null)
  const providerRef = useRef<HTMLSelectElement>(null)
  const modelRef = useRef<HTMLInputElement>(null)

  const handleInvoke = (invoke: (config: AgentToolCallConfig) => Promise<void>) => {
    const prompt = promptRef.current?.value
    const provider = providerRef.current?.value as 'claude' | 'gemini' | 'codex'
    const model = modelRef.current?.value

    if (!prompt || !provider || !model) {
      alert('Please fill in all fields')
      return
    }

    invoke({
      provider,
      model,
      prompt,
    })
  }

  return (
    <AgentInvoker
      agentContext={agentContext}
      onInvokeComplete={(response) => {
        console.log('Agent response:', response)
        onResponse?.(response)
      }}
      onInvokeError={(error) => {
        console.error('Agent error:', error)
      }}
    >
      {({ invoke, isInvoking, lastResponse, error, activeInvocations }) => (
        <div style={{
          fontFamily: 'monospace',
          backgroundColor: '#000',
          color: '#fff',
          padding: '1rem',
          border: '1px solid #fff',
          minWidth: '600px'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', borderBottom: '1px solid #fff', paddingBottom: '0.5rem' }}>
            AGENT INVOKER TERMINAL
          </h3>

          {/* Configuration Form */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem' }}>PROVIDER:</label>
              <select
                ref={providerRef}
                disabled={isInvoking}
                style={{
                  fontFamily: 'monospace',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #fff',
                  padding: '0.25rem',
                  width: '100%'
                }}
              >
                <option value="">SELECT PROVIDER</option>
                <option value="claude">CLAUDE</option>
                <option value="gemini">GEMINI</option>
                <option value="codex">CODEX</option>
              </select>
            </div>

            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem' }}>MODEL:</label>
              <input
                ref={modelRef}
                type="text"
                placeholder="e.g., claude-3-sonnet, gemini-pro, gpt-4"
                disabled={isInvoking}
                style={{
                  fontFamily: 'monospace',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #fff',
                  padding: '0.25rem',
                  width: '100%'
                }}
              />
            </div>

            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem' }}>PROMPT:</label>
              <input
                ref={promptRef}
                type="text"
                placeholder="Enter your prompt..."
                disabled={isInvoking}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isInvoking) {
                    handleInvoke(invoke)
                  }
                }}
                style={{
                  fontFamily: 'monospace',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #fff',
                  padding: '0.25rem',
                  width: '100%'
                }}
              />
            </div>

            <button
              onClick={() => handleInvoke(invoke)}
              disabled={isInvoking}
              style={{
                fontFamily: 'monospace',
                backgroundColor: '#000',
                color: '#fff',
                border: '1px solid #fff',
                padding: '0.5rem 1rem',
                cursor: isInvoking ? 'not-allowed' : 'pointer',
                width: '100%'
              }}
            >
              {isInvoking ? '[INVOKING...]' : '[INVOKE AGENT]'}
            </button>
          </div>

          {/* Active Invocations Status */}
          {activeInvocations.length > 0 && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.5rem',
              border: '1px solid #ff0',
              color: '#ff0'
            }}>
              <div style={{ marginBottom: '0.25rem' }}>ACTIVE INVOCATIONS: {activeInvocations.length}</div>
              {activeInvocations.map((inv) => (
                <div key={inv.id} style={{ fontSize: '0.8rem' }}>
                  ▶ {inv.config.provider.toUpperCase()}: {inv.status.toUpperCase()}
                </div>
              ))}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.5rem',
              border: '1px solid #f00',
              color: '#f00'
            }}>
              <div style={{ marginBottom: '0.25rem' }}>[ERROR]</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
                {error}
              </pre>
            </div>
          )}

          {/* Response Display */}
          {lastResponse && (
            <div style={{
              marginTop: '1rem',
              padding: '0.5rem',
              border: '1px solid #0f0',
              color: '#0f0'
            }}>
              <div style={{ marginBottom: '0.5rem' }}>
                [RESPONSE] {lastResponse.provider.toUpperCase()} | {lastResponse.model} | {lastResponse.duration}ms
              </div>

              <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                <strong>CONTENT:</strong>
              </div>
              <pre style={{
                margin: '0 0 1rem 0',
                whiteSpace: 'pre-wrap',
                fontSize: '0.8rem',
                color: '#ccc'
              }}>
                {lastResponse.content}
              </pre>

              {lastResponse.structured && (
                <div>
                  <div style={{ marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                    <strong>STRUCTURED:</strong>
                  </div>
                  <pre style={{
                    margin: '0 0 1rem 0',
                    fontSize: '0.7rem',
                    color: '#ccc'
                  }}>
                    {JSON.stringify(JSON.parse(lastResponse.structured), null, 2)}
                  </pre>
                </div>
              )}

              {lastResponse.toolCalls && lastResponse.toolCalls.length > 0 && (
                <div>
                  <div style={{ marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                    <strong>TOOL CALLS:</strong>
                  </div>
                  {lastResponse.toolCalls.map((call, i) => (
                    <div key={i} style={{ marginBottom: '0.5rem', fontSize: '0.8rem', color: '#ccc' }}>
                      <strong>{call.name}:</strong> {call.result || 'No result'}
                    </div>
                  ))}
                </div>
              )}

              {lastResponse.nestedResponses && lastResponse.nestedResponses.length > 0 && (
                <div>
                  <div style={{ marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                    <strong>NESTED RESPONSES ({lastResponse.nestedResponses.length}):</strong>
                  </div>
                  {lastResponse.nestedResponses.map((nested, i) => (
                    <div key={i} style={{
                      marginBottom: '0.5rem',
                      padding: '0.25rem',
                      border: '1px solid #666',
                      fontSize: '0.8rem',
                      color: '#ccc'
                    }}>
                      <div><strong>{nested.provider.toUpperCase()}</strong> ({nested.duration}ms)</div>
                      <div>{nested.content.slice(0, 100)}...</div>
                    </div>
                  ))}
                </div>
              )}

              {lastResponse.usage && (
                <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.5rem' }}>
                  TOKENS: {lastResponse.usage.promptTokens}+{lastResponse.usage.completionTokens} = {lastResponse.usage.totalTokens}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </AgentInvoker>
  )
}
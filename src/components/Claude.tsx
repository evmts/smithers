import { createSignal, onMount, useContext, type JSX } from 'solid-js'
import { RalphContext } from './Ralph'

/**
 * Execute a prompt using Claude Agent SDK.
 * This is a placeholder - will integrate with @anthropic-ai/claude-agent-sdk.
 */
async function executeWithClaudeSDK(config: {
  prompt: string
  model: string
  maxTurns?: number
  tools?: string[]
  systemPrompt?: string
}): Promise<unknown> {
  // TODO: Integrate with @anthropic-ai/claude-agent-sdk

  // For now, return mock response for testing
  if (process.env.NODE_ENV === 'test' || process.env.MOCK_MODE === 'true') {
    // Simulate some async delay
    await new Promise(resolve => setTimeout(resolve, 10))

    return {
      output: `Mock response for: ${config.prompt}`,
      model: config.model,
      turns: 1,
    }
  }

  throw new Error('Claude SDK integration not yet implemented')
}

export interface ClaudeProps {
  children?: JSX.Element
  model?: string
  maxTurns?: number
  tools?: string[]
  systemPrompt?: string
  onFinished?: (result: unknown) => void
  onError?: (error: Error) => void
  validate?: (result: unknown) => Promise<boolean>
  [key: string]: unknown
}

/**
 * Claude component that executes on mount.
 *
 * CRITICAL PATTERN: This component is BOTH declaration AND execution.
 * When it mounts, it executes itself. No external orchestrator needed.
 *
 * GOTCHA: Use fire-and-forget async IIFE inside onMount:
 *   onMount(() => {
 *     (async () => { ... })()  // ← Fire and forget
 *   })
 *
 * NOT: onMount(async () => { ... })  // ← Doesn't work!
 */
export function Claude(props: ClaudeProps): JSX.Element {
  const ralph = useContext(RalphContext)
  const [status, setStatus] = createSignal<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [result, setResult] = createSignal<unknown>(null)
  const [error, setError] = createSignal<Error | null>(null)

  onMount(() => {
    // Fire-and-forget async IIFE
    // This is the CRITICAL pattern for async execution in Solid onMount
    (async () => {
      // Register with Ralph (if present)
      ralph?.registerTask()

      try {
        setStatus('running')

        const response = await executeWithClaudeSDK({
          prompt: String(props.children),
          model: props.model || 'claude-sonnet-4',
          maxTurns: props.maxTurns,
          tools: props.tools,
          systemPrompt: props.systemPrompt,
        })

        // Optional validation
        if (props.validate) {
          const isValid = await props.validate(response)
          if (!isValid) {
            throw new Error('Validation failed')
          }
        }

        setResult(response)
        setStatus('complete')
        props.onFinished?.(response)

      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        setError(errorObj)
        setStatus('error')
        props.onError?.(errorObj)
      } finally {
        // Always complete task with Ralph
        ralph?.completeTask()
      }
    })()
    // Note: No await, no return - just fire and forget
  })

  return (
    <claude
      status={status()}
      result={result()}
      error={error()?.message}
      model={props.model}
    >
      {props.children}
    </claude>
  )
}

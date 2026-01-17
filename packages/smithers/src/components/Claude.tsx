import { createSignal, onMount, useContext } from '../solid-shim.js'
import type { JSX } from 'solid-js'
import { RalphContext } from './Ralph.js'

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
 * Claude component - executes a prompt using Claude Agent SDK on mount.
 *
 * This is an active Solid component that:
 * 1. Registers with Ralph context (if present)
 * 2. Executes the prompt via Claude API on mount
 * 3. Tracks execution status via signals
 * 4. Calls onFinished callback when complete
 * 5. Unregisters from Ralph context
 *
 * The component renders its execution state to the tree, which can be
 * serialized to XML to show current status.
 *
 * @example
 * ```tsx
 * <Claude
 *   model="sonnet"
 *   tools={['read', 'write']}
 *   onFinished={(result) => setPhase('next')}
 *   validate={async (result) => await runTests()}
 * >
 *   Implement the user authentication feature per specs/auth.md
 * </Claude>
 * ```
 */
export function Claude(props: ClaudeProps) {
  const ralph = useContext(RalphContext)
  const [status, setStatus] = createSignal<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [result, setResult] = createSignal<unknown>(null)
  const [error, setError] = createSignal<Error | null>(null)

  onMount(async () => {
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

      // Validate if validator provided (backpressure)
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
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      setStatus('error')
      props.onError?.(error)
    } finally {
      ralph?.completeTask()
    }
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
  return {
    output: 'Mock response for: ' + config.prompt,
    model: config.model,
  }
}

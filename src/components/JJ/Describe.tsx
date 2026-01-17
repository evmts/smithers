import { createSignal, onMount, useContext, type JSX } from 'solid-js'
import { RalphContext } from '../Ralph'
import { useSmithers } from '../../orchestrator/components/SmithersProvider'

export interface DescribeProps {
  useAgent?: 'claude'
  template?: string
  children?: JSX.Element
}

/**
 * Generate commit message using Claude based on diff.
 * This is a placeholder - will integrate with actual Claude SDK.
 */
async function generateDescriptionWithClaude(
  diff: string,
  template?: string
): Promise<string> {
  // TODO: Integrate with Claude SDK for auto-describe
  if (process.env.NODE_ENV === 'test' || process.env.MOCK_MODE === 'true') {
    const templatePart = template ? ` using template: ${template}` : ''
    return `Auto-generated description for diff with ${diff.split('\n').length} lines${templatePart}`
  }

  // For now, return a generic description
  const templatePart = template ? ` (template: ${template})` : ''
  return `Changes made by Smithers orchestration${templatePart}`
}

/**
 * JJ Describe component - auto-generates commit message using AI.
 *
 * Uses the fire-and-forget async IIFE pattern in onMount.
 * Registers with Ralph for task tracking.
 */
export function Describe(props: DescribeProps): JSX.Element {
  const ralph = useContext(RalphContext)
  const smithers = useSmithers()
  const [status, setStatus] = createSignal<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [description, setDescription] = createSignal<string | null>(null)
  const [error, setError] = createSignal<Error | null>(null)

  onMount(() => {
    // Fire-and-forget async IIFE
    (async () => {
      ralph?.registerTask()

      try {
        setStatus('running')

        // Get the current diff
        const diff = await Bun.$`jj diff`.text()

        let generatedDescription: string

        // Generate description based on agent
        if (props.useAgent === 'claude') {
          generatedDescription = await generateDescriptionWithClaude(diff, props.template)
        } else {
          // Default: simple description
          const lines = diff.split('\n').length
          generatedDescription = `Changes: ${lines} lines modified`
        }

        // Update JJ description
        await Bun.$`jj describe -m ${generatedDescription}`.quiet()

        setDescription(generatedDescription)
        setStatus('complete')

        // Log to vcs reports
        await smithers.db.vcs.addReport({
          type: 'progress',
          title: 'JJ Describe',
          content: generatedDescription,
          data: {
            useAgent: props.useAgent,
            template: props.template,
          },
        })
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        setError(errorObj)
        setStatus('error')
      } finally {
        ralph?.completeTask()
      }
    })()
  })

  return (
    <jj-describe
      status={status()}
      description={description()}
      error={error()?.message}
      use-agent={props.useAgent}
      template={props.template}
    >
      {props.children}
    </jj-describe>
  )
}

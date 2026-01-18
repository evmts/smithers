import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useMount, useMountedState } from '../../reconciler/hooks.js'

export interface DescribeProps {
  useAgent?: 'claude'
  template?: string
  children?: ReactNode
}

/**
 * JJ Describe component - auto-generates commit message.
 *
 * React pattern: Uses useEffect with empty deps and async IIFE inside.
 * Registers with Ralph for task tracking.
 */
export function Describe(props: DescribeProps): ReactNode {
  const smithers = useSmithers()
  const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [description, setDescription] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  useMount(() => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = smithers.db.tasks.start('jj-describe')

      try {
        setStatus('running')

        // Get the current diff
        const diff = await Bun.$`jj diff`.text()

        // Generate description
        const lines = diff.split('\n').length
        const generatedDescription = `Changes: ${lines} lines modified`

        // Update JJ description
        await Bun.$`jj describe -m ${generatedDescription}`.quiet()

        if (isMounted()) {
          setDescription(generatedDescription)
          setStatus('complete')
        }

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
        if (isMounted()) {
          const errorObj = err instanceof Error ? err : new Error(String(err))
          setError(errorObj)
          setStatus('error')
        }
      } finally {
        // Complete task
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  return (
    <jj-describe
      status={status}
      description={description}
      error={error?.message}
      use-agent={props.useAgent}
      template={props.template}
    >
      {props.children}
    </jj-describe>
  )
}

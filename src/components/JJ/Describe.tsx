import { useRef, useReducer, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useEffectOnValueChange, useMountedState } from '../../reconciler/hooks.js'
import { useExecutionEnabled } from '../../hooks/useExecutionEnabled.js'

export interface DescribeProps {
  useAgent?: 'claude'
  template?: string
  children?: ReactNode
}

/**
 * JJ Describe component - auto-generates commit message.
 *
 * React pattern: Uses useRef + forceUpdate for fire-and-forget VCS ops.
 * Registers with Ralph for task tracking.
 */
export function Describe(props: DescribeProps): ReactNode {
  const smithers = useSmithers()
  const [, forceUpdate] = useReducer((x) => x + 1, 0)

  const statusRef = useRef<'pending' | 'running' | 'complete' | 'error'>('pending')
  const descriptionRef = useRef<string | null>(null)
  const errorRef = useRef<Error | null>(null)
  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()
  const executionEnabled = useExecutionEnabled()
  const hasStartedRef = useRef(false)

  useEffectOnValueChange(executionEnabled, () => {
    if (!executionEnabled) {
      hasStartedRef.current = false
      return
    }
    if (hasStartedRef.current) {
      return
    }
    hasStartedRef.current = true
    ;(async () => {
      taskIdRef.current = smithers.db.tasks.start('jj-describe')

      try {
        statusRef.current = 'running'
        forceUpdate()

        const diff = await Bun.$`jj diff`.text()

        const lines = diff.split('\n').length
        const generatedDescription = `Changes: ${lines} lines modified`

        await Bun.$`jj describe -m ${generatedDescription}`.quiet()

        if (isMounted()) {
          descriptionRef.current = generatedDescription
          statusRef.current = 'complete'
          forceUpdate()
        }

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
          errorRef.current = err instanceof Error ? err : new Error(String(err))
          statusRef.current = 'error'
          forceUpdate()
        }
      } finally {
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  return (
    <jj-describe
      status={statusRef.current}
      description={descriptionRef.current}
      error={errorRef.current?.message}
      use-agent={props.useAgent}
      template={props.template}
    >
      {props.children}
    </jj-describe>
  )
}

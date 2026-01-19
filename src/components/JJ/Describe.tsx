import { useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useExecutionScope } from '../ExecutionScope.js'
import { useExecutionMount } from '../../reconciler/hooks.js'
import { useQueryValue } from '../../reactive-sqlite/index.js'
import { makeStateKey } from '../../utils/scope.js'

export interface DescribeProps {
  id?: string
  useAgent?: 'claude'
  template?: string
  children?: ReactNode
}

/**
 * JJ Describe component - auto-generates commit message.
 *
 * React pattern: Uses refs + version tracking for fire-and-forget VCS ops.
 * Registers with Ralph for task tracking.
 */
interface DescribeState {
  status: 'pending' | 'running' | 'complete' | 'error'
  description: string | null
  error: string | null
}

export function Describe(props: DescribeProps): ReactNode {
  const smithers = useSmithers()
  const executionScope = useExecutionScope()
  const opIdRef = useRef(props.id ?? crypto.randomUUID())
  const stateKey = makeStateKey(smithers.executionId ?? 'execution', 'jj-describe', opIdRef.current)

  const { data: opState } = useQueryValue<string>(
    smithers.db.db,
    'SELECT value FROM state WHERE key = ?',
    [stateKey]
  )
  const defaultState: DescribeState = { status: 'pending', description: null, error: null }
  const { status, description, error } = (() => {
    if (!opState) return defaultState
    try { return JSON.parse(opState) as DescribeState }
    catch { return defaultState }
  })()

  const taskIdRef = useRef<string | null>(null)
  const shouldExecute = smithers.executionEnabled && executionScope.enabled

  const setState = (newState: DescribeState) => {
    smithers.db.state.set(stateKey, newState, 'jj-describe')
  }

  useExecutionMount(shouldExecute, () => {
    ;(async () => {
      if (status !== 'pending') return
      taskIdRef.current = smithers.db.tasks.start('jj-describe', undefined, { scopeId: executionScope.scopeId })

      try {
        setState({ status: 'running', description: null, error: null })

        const diff = await Bun.$`jj diff`.text()
        const lines = diff.split('\n').length
        const generatedDescription = `Changes: ${lines} lines modified`

        await Bun.$`jj describe -m ${generatedDescription}`.quiet()

        await smithers.db.vcs.addReport({
          type: 'progress',
          title: 'JJ Describe',
          content: generatedDescription,
          data: {
            useAgent: props.useAgent,
            template: props.template,
          },
        })

        setState({ status: 'complete', description: generatedDescription, error: null })
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        setState({ status: 'error', description: null, error: errorObj.message })
      } finally {
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  }, [props.template, props.useAgent, smithers, status, shouldExecute])

  return (
    <jj-describe
      status={status}
      description={description ?? undefined}
      error={error ?? undefined}
      use-agent={props.useAgent}
      template={props.template}
    >
      {props.children}
    </jj-describe>
  )
}

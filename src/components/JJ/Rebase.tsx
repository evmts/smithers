import { useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useExecutionScope } from '../ExecutionScope.js'
import { useMountedState, useExecutionMount } from '../../reconciler/hooks.js'
import { useQueryValue } from '../../reactive-sqlite/index.js'
import { makeStateKey } from '../../utils/scope.js'

export interface RebaseProps {
  id?: string
  destination?: string
  source?: string
  onConflict?: (conflicts: string[]) => void
  children?: ReactNode
}

/**
 * Parse conflict files from jj rebase output or status.
 */
function parseConflicts(output: string): string[] {
  const conflicts: string[] = []
  const lines = output.split('\n')

  for (const line of lines) {
    if (line.includes('conflict') || line.startsWith('C ')) {
      const match = line.match(/C\s+(.+)/)
      if (match && match[1]) {
        conflicts.push(match[1].trim())
      } else {
        const fileMatch = line.match(/['"]([^'"]+)['"]/g)
        if (fileMatch) {
          conflicts.push(...fileMatch.map((f) => f.replace(/['"]/g, '')))
        }
      }
    }
  }

  return conflicts
}

/**
 * JJ Rebase component - performs JJ rebase with conflict handling.
 *
 * React pattern: Uses refs + version tracking for fire-and-forget VCS ops.
 * Registers with Ralph for task tracking.
 */
interface RebaseState {
  status: 'pending' | 'running' | 'complete' | 'conflict' | 'error'
  conflicts: string[]
  error: string | null
}

export function Rebase(props: RebaseProps): ReactNode {
  const smithers = useSmithers()
  const executionScope = useExecutionScope()
  const opIdRef = useRef(props.id ?? crypto.randomUUID())
  const stateKey = makeStateKey(smithers.executionId ?? 'execution', 'jj-rebase', opIdRef.current)

  const { data: opState } = useQueryValue<string>(
    smithers.db.db,
    'SELECT value FROM state WHERE key = ?',
    [stateKey]
  )
  const defaultState: RebaseState = { status: 'pending', conflicts: [], error: null }
  const { status, conflicts, error } = (() => {
    if (!opState) return defaultState
    try { return JSON.parse(opState) as RebaseState }
    catch { return defaultState }
  })()

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()
  const shouldExecute = smithers.executionEnabled && executionScope.enabled

  const setState = (newState: RebaseState) => {
    smithers.db.state.set(stateKey, newState, 'jj-rebase')
  }

  useExecutionMount(shouldExecute, () => {
    ;(async () => {
      if (status !== 'pending') return
      taskIdRef.current = smithers.db.tasks.start('jj-rebase', undefined, { scopeId: executionScope.scopeId })

      try {
        setState({ status: 'running', conflicts: [], error: null })

        const args: string[] = ['rebase']

        if (props.destination) {
          args.push('-d', props.destination)
        }

        if (props.source) {
          args.push('-s', props.source)
        }

        let rebaseOutput: string
        let hasConflicts = false

        try {
          const result = await Bun.$`jj ${args}`.quiet()
          rebaseOutput = result.stdout.toString() + result.stderr.toString()
        } catch (rebaseError: any) {
          rebaseOutput = rebaseError.stderr?.toString() || rebaseError.message
          hasConflicts = rebaseOutput.toLowerCase().includes('conflict')
        }

        const detectedConflicts = parseConflicts(rebaseOutput)
        const statusResult = await Bun.$`jj status`.text()
        const statusConflicts = parseConflicts(statusResult)

        const allConflicts = [...new Set([...detectedConflicts, ...statusConflicts])]

        if (allConflicts.length > 0 || hasConflicts) {
          await smithers.db.vcs.addReport({
            type: 'warning',
            title: 'JJ Rebase Conflicts',
            content: `Rebase resulted in ${allConflicts.length} conflict(s)`,
            severity: 'warning',
            data: {
              destination: props.destination,
              source: props.source,
              conflicts: allConflicts,
            },
          })

          setState({ status: 'conflict', conflicts: allConflicts, error: null })
          if (isMounted()) {
            props.onConflict?.(allConflicts)
          }
        } else {
          await smithers.db.vcs.addReport({
            type: 'progress',
            title: 'JJ Rebase Complete',
            content: `Successfully rebased${props.source ? ` from ${props.source}` : ''}${props.destination ? ` to ${props.destination}` : ''}`,
            data: {
              destination: props.destination,
              source: props.source,
            },
          })

          setState({ status: 'complete', conflicts: [], error: null })
        }
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        setState({ status: 'error', conflicts: [], error: errorObj.message })

        await smithers.db.vcs.addReport({
          type: 'error',
          title: 'JJ Rebase Failed',
          content: errorObj.message,
          severity: 'critical',
          data: {
            destination: props.destination,
            source: props.source,
          },
        })
      } finally {
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  }, [props.destination, props.onConflict, props.source, smithers, status, shouldExecute])

  return (
    <jj-rebase
      status={status}
      destination={props.destination}
      source={props.source}
      conflicts={conflicts.join(',')}
      error={error ?? undefined}
    >
      {props.children}
    </jj-rebase>
  )
}

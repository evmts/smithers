import { useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useMountedState, useExecutionMount } from '../../reconciler/hooks.js'
import { useExecutionContext } from '../ExecutionContext.js'
import { useVersionTracking } from '../../reactive-sqlite/index.js'

export interface RebaseProps {
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
export function Rebase(props: RebaseProps): ReactNode {
  const smithers = useSmithers()
  const execution = useExecutionContext()
  const { invalidateAndUpdate } = useVersionTracking()

  const statusRef = useRef<'pending' | 'running' | 'complete' | 'conflict' | 'error'>('pending')
  const conflictsRef = useRef<string[]>([])
  const errorRef = useRef<Error | null>(null)
  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  const shouldExecute = smithers.executionEnabled && execution.isActive
  useExecutionMount(shouldExecute, () => {
    ;(async () => {
      taskIdRef.current = smithers.db.tasks.start('jj-rebase')

      try {
        statusRef.current = 'running'
        invalidateAndUpdate()

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

        if (!isMounted()) return

        const detectedConflicts = parseConflicts(rebaseOutput)

        const statusResult = await Bun.$`jj status`.text()
        const statusConflicts = parseConflicts(statusResult)

        const allConflicts = [...new Set([...detectedConflicts, ...statusConflicts])]
        conflictsRef.current = allConflicts

        if (allConflicts.length > 0 || hasConflicts) {
          if (isMounted()) {
            statusRef.current = 'conflict'
            invalidateAndUpdate()
            props.onConflict?.(allConflicts)
          }

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
        } else {
          if (isMounted()) {
            statusRef.current = 'complete'
            invalidateAndUpdate()
          }

          await smithers.db.vcs.addReport({
            type: 'progress',
            title: 'JJ Rebase Complete',
            content: `Successfully rebased${props.source ? ` from ${props.source}` : ''}${props.destination ? ` to ${props.destination}` : ''}`,
            data: {
              destination: props.destination,
              source: props.source,
            },
          })
        }
      } catch (err) {
        if (isMounted()) {
          errorRef.current = err instanceof Error ? err : new Error(String(err))
          statusRef.current = 'error'
          invalidateAndUpdate()
        }

        const errorObj = err instanceof Error ? err : new Error(String(err))
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
  }, [props.destination, props.onConflict, props.source, smithers])

  return (
    <jj-rebase
      status={statusRef.current}
      destination={props.destination}
      source={props.source}
      conflicts={conflictsRef.current.join(',')}
      error={errorRef.current?.message}
    >
      {props.children}
    </jj-rebase>
  )
}

import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider'
import { useMount, useMountedState } from '../../reconciler/hooks'

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
    // JJ marks conflicts with 'C' or mentions them in output
    if (line.includes('conflict') || line.startsWith('C ')) {
      const match = line.match(/C\s+(.+)/)
      if (match) {
        conflicts.push(match[1].trim())
      } else {
        // Try to extract file paths from conflict messages
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
 * React pattern: Uses useEffect with empty deps and async IIFE inside.
 * Registers with Ralph for task tracking.
 */
export function Rebase(props: RebaseProps): ReactNode {
  const smithers = useSmithers()
  const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'conflict' | 'error'>('pending')
  const [conflicts, setConflicts] = useState<string[]>([])
  const [error, setError] = useState<Error | null>(null)

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  useMount(() => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = smithers.db.tasks.start('jj-rebase')

      try {
        setStatus('running')

        // Build rebase command
        const args: string[] = ['rebase']

        if (props.destination) {
          args.push('-d', props.destination)
        }

        if (props.source) {
          args.push('-s', props.source)
        }

        // Execute rebase
        let rebaseOutput: string
        let hasConflicts = false

        try {
          const result = await Bun.$`jj ${args}`.quiet()
          rebaseOutput = result.stdout.toString() + result.stderr.toString()
        } catch (rebaseError: any) {
          // JJ rebase may fail with conflicts but still "succeed"
          rebaseOutput = rebaseError.stderr?.toString() || rebaseError.message
          hasConflicts = rebaseOutput.toLowerCase().includes('conflict')
        }

        if (!isMounted()) return

        // Check for conflicts in output
        const detectedConflicts = parseConflicts(rebaseOutput)

        // Also check jj status for conflicts
        const statusResult = await Bun.$`jj status`.text()
        const statusConflicts = parseConflicts(statusResult)

        const allConflicts = [...new Set([...detectedConflicts, ...statusConflicts])]
        setConflicts(allConflicts)

        if (allConflicts.length > 0 || hasConflicts) {
          if (isMounted()) {
            setStatus('conflict')
            props.onConflict?.(allConflicts)
          }

          // Log conflict to database
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
            setStatus('complete')
          }

          // Log successful rebase
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
          const errorObj = err instanceof Error ? err : new Error(String(err))
          setError(errorObj)
          setStatus('error')
        }

        // Log error to database
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
        // Complete task
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  return (
    <jj-rebase
      status={status}
      destination={props.destination}
      source={props.source}
      conflicts={conflicts.join(',')}
      error={error?.message}
    >
      {props.children}
    </jj-rebase>
  )
}

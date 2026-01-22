import type { ReactNode } from 'react'
import { useJJOperation } from './useJJOperation.js'

export interface RebaseProps {
  id?: string
  destination?: string
  source?: string
  onConflict?: (conflicts: string[]) => void
  children?: ReactNode
}

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

interface RebaseState {
  status: 'pending' | 'running' | 'complete' | 'conflict' | 'error'
  conflicts: string[]
  error: string | null
}

export function Rebase(props: RebaseProps): ReactNode {
  const defaultState: RebaseState = { status: 'pending', conflicts: [], error: null }
  const { state } = useJJOperation<RebaseState>({
    ...(props.id ? { id: props.id } : {}),
    operationType: 'jj-rebase',
    defaultState,
    deps: [props.destination, props.onConflict, props.source],
    execute: async ({ smithers, setState, isMounted }) => {
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
      }
    },
  })
  const { status, conflicts, error } = state

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

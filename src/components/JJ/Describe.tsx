import type { ReactNode } from 'react'
import { useJJOperation } from './useJJOperation.js'

export interface DescribeProps {
  id?: string
  useAgent?: 'claude'
  template?: string
  children?: ReactNode
}

interface DescribeState {
  status: 'pending' | 'running' | 'complete' | 'error'
  description: string | null
  error: string | null
}

export function Describe(props: DescribeProps): ReactNode {
  const defaultState: DescribeState = { status: 'pending', description: null, error: null }
  const { state } = useJJOperation<DescribeState>({
    ...(props.id ? { id: props.id } : {}),
    operationType: 'jj-describe',
    defaultState,
    deps: [props.template, props.useAgent],
    execute: async ({ smithers, setState }) => {
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
      }
    },
  })
  const { status, description, error } = state

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

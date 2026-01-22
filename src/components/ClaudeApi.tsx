import type { ReactNode } from 'react'

export interface ClaudeApiProps {
  children?: ReactNode
  model?: string
  maxTurns?: number
  tools?: string[]
  systemPrompt?: string
  onFinished?: (result: unknown) => void
  onError?: (error: Error) => void
}

export function ClaudeApi(props: ClaudeApiProps): ReactNode {
  return (
    <claude-api model={props.model}>
      {props.children}
    </claude-api>
  )
}

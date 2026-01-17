import type { JSX } from 'solid-js'

export interface ClaudeProps {
  children?: JSX.Element
  model?: string
  maxTurns?: number
  onFinished?: (result: unknown) => void
  onError?: (error: Error) => void
  [key: string]: unknown
}

/**
 * Claude component - executes a prompt using Claude Agent SDK
 */
export function Claude(props: ClaudeProps): JSX.Element {
  return props as unknown as JSX.Element
}

import type { JSX } from 'solid-js'

export interface ClaudeApiProps {
  children?: JSX.Element
  model?: string
  maxTurns?: number
  tools?: string[]
  systemPrompt?: string
  onFinished?: (result: unknown) => void
  onError?: (error: Error) => void
  [key: string]: unknown
}

/**
 * ClaudeApi component - alternative executor using the Anthropic API directly.
 *
 * Unlike the standard Claude component which uses Claude Code CLI,
 * ClaudeApi uses the Anthropic SDK directly for API calls.
 *
 * @example
 * ```tsx
 * <ClaudeApi model="claude-sonnet-4">
 *   Generate a haiku about programming
 * </ClaudeApi>
 * ```
 */
export function ClaudeApi(props: ClaudeApiProps): JSX.Element {
  return (
    <claude-api model={props.model}>
      {props.children}
    </claude-api>
  )
}

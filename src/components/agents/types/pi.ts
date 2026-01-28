import type { BaseAgentProps, StopCondition } from './agents.js'

export type PiThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high'

export interface PiProps extends BaseAgentProps {
  /** Provider (anthropic, openai, google, etc.) */
  provider?: string
  /** Model ID */
  model?: string
  /** Thinking level */
  thinking?: PiThinkingLevel
  /** System prompt override */
  systemPrompt?: string
  /** Append to system prompt */
  appendSystemPrompt?: string
  /** Tool list (pi builtins only: read,bash,edit,write,grep,find,ls) */
  tools?: string[]
  /** Timeout in ms */
  timeout?: number
  /** Stop conditions */
  stopConditions?: StopCondition[]
  /** Working directory */
  cwd?: string
  /** Number of tail log entries to display during execution. */
  tailLogCount?: number
  /** Number of lines to show per tail log entry. */
  tailLogLines?: number
}

export interface PiCLIExecutionOptions {
  prompt: string
  provider?: string
  model?: string
  thinking?: PiThinkingLevel
  systemPrompt?: string
  appendSystemPrompt?: string
  tools?: string[]
  timeout?: number
  cwd?: string
  stopConditions?: StopCondition[]
  onProgress?: (chunk: string) => void
}

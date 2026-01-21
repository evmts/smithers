// Agent adapter interface for useAgentRunner
import type { TailLogEntry } from '../../components/agents/claude-cli/message-parser.js'
import type { AgentResult } from '../../components/agents/types/execution.js'
import type { SmithersStreamPart } from '../../streaming/types.js'

export type AgentName = 'claude' | 'amp' | 'codex'

export interface MessageParserInterface {
  parseChunk(chunk: string): void
  flush(): void
  getLatestEntries(n: number): TailLogEntry[]
}

export interface StreamParserInterface {
  parse(chunk: string): SmithersStreamPart[]
  flush(): SmithersStreamPart[]
}

export interface AdapterBuildContext {
  prompt: string
  cwd: string | undefined
  mcpConfigPath: string | undefined
  /** Built-in tools extracted from tools prop (added to allowedTools) */
  builtinTools?: string[]
}

export interface ExtractPromptResult {
  prompt: string
  mcpConfigPath: string | undefined
}

export interface AgentAdapter<TProps, TOptions> {
  name: AgentName
  getAgentLabel(options: TOptions): string
  getLoggerName(): string
  getLoggerContext(props: TProps): Record<string, string>
  extractPrompt(childrenString: string, props: TProps): ExtractPromptResult | Promise<ExtractPromptResult>
  buildOptions(props: TProps, ctx: AdapterBuildContext): TOptions
  execute(options: TOptions & { onProgress: (chunk: string) => void }): Promise<AgentResult>
  createMessageParser(maxEntries: number, onToolCall?: (toolName: string, input: unknown) => void): MessageParserInterface
  createStreamParser?(): StreamParserInterface | null
  supportsTypedStreaming(props: TProps): boolean
  getDefaultOutputFormat?(props: TProps): string | undefined
}

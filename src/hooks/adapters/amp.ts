// Amp agent adapter
import type { AgentAdapter, MessageParserInterface } from './types.js'
import type { AmpProps, AmpCLIExecutionOptions } from '../../components/agents/types/amp.js'
import type { AgentResult } from '../../components/agents/types/execution.js'
import { executeAmpCLI } from '../../components/agents/amp-cli/executor.js'
import { AmpMessageParser } from '../../components/agents/amp-cli/output-parser.js'
import { AmpStreamParser } from '../../streaming/amp-parser.js'

class AmpMessageParserWrapper implements MessageParserInterface {
  private parser: AmpMessageParser
  constructor(maxEntries: number, onToolCall?: (toolName: string, input: unknown) => void) {
    this.parser = new AmpMessageParser(maxEntries, onToolCall)
  }
  parseChunk(chunk: string): void { this.parser.parseChunk(chunk) }
  flush(): void { this.parser.flush() }
  getLatestEntries(n: number) { return this.parser.getLatestEntries(n) }
}

export const AmpAdapter: AgentAdapter<AmpProps, AmpCLIExecutionOptions> = {
  name: 'amp',
  getAgentLabel(options) { return `amp-${options.mode ?? 'smart'}` },
  getLoggerName() { return 'Amp' },
  getLoggerContext(props) { return { mode: props.mode ?? 'smart' } },
  extractPrompt(childrenString): { prompt: string; mcpConfigPath: string | undefined } {
    return { prompt: childrenString, mcpConfigPath: undefined }
  },
  buildOptions(props, ctx) {
    const options: AmpCLIExecutionOptions = { prompt: ctx.prompt }
    if (props.mode !== undefined) options.mode = props.mode
    if (props.permissionMode !== undefined) options.permissionMode = props.permissionMode
    if (props.maxTurns !== undefined) options.maxTurns = props.maxTurns
    if (props.systemPrompt !== undefined) options.systemPrompt = props.systemPrompt
    if (ctx.cwd !== undefined) options.cwd = ctx.cwd
    if (props.timeout !== undefined) options.timeout = props.timeout
    if (props.stopConditions !== undefined) options.stopConditions = props.stopConditions
    if (props.continueThread !== undefined) options.continue = props.continueThread
    if (props.resumeThread !== undefined) options.resume = props.resumeThread
    if (props.labels !== undefined) options.labels = props.labels
    if (props.onToolCall !== undefined) options.onToolCall = props.onToolCall
    return options
  },
  async execute(options): Promise<AgentResult> {
    const result = await executeAmpCLI(options)
    if (result.stopReason === 'error') throw new Error(result.output || 'Amp CLI execution failed')
    return result
  },
  createMessageParser(maxEntries, onToolCall) { return new AmpMessageParserWrapper(maxEntries, onToolCall) },
  createStreamParser() { return new AmpStreamParser() },
  supportsTypedStreaming(props: AmpProps) {
    const p = props as unknown as Record<string, unknown>
    return p['experimentalTypedStreaming'] === true || props.onStreamPart !== undefined
  },
}

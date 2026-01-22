import type { AgentAdapter, MessageParserInterface } from './types.js'
import type { OpenCodeProps, OpenCodeExecutionOptions } from '../../components/agents/types/opencode.js'
import type { AgentResult } from '../../components/agents/types/execution.js'
import { executeOpenCode } from '../../components/agents/OpenCodeSDK.js'
import { MessageParser } from '../../components/agents/claude-cli/message-parser.js'

class OpenCodeMessageParserWrapper implements MessageParserInterface {
  private parser: MessageParser
  constructor(maxEntries: number) {
    this.parser = new MessageParser(maxEntries)
  }
  parseChunk(chunk: string): void {
    this.parser.parseChunk(chunk)
  }
  flush(): void {
    this.parser.flush()
  }
  getLatestEntries(n: number) {
    return this.parser.getLatestEntries(n)
  }
}

export const OpenCodeAdapter: AgentAdapter<OpenCodeProps, OpenCodeExecutionOptions> = {
  name: 'opencode',

  getAgentLabel(options) {
    return options.model ?? 'opencode/big-pickle'
  },

  getLoggerName() {
    return 'OpenCode'
  },

  getLoggerContext(props) {
    const ctx: Record<string, string> = { model: props.model ?? 'opencode/big-pickle' }
    if (props.agent) ctx['agent'] = props.agent
    return ctx
  },

  async extractPrompt(childrenString, _props): Promise<{ prompt: string; mcpConfigPath: string | undefined }> {
    return { prompt: childrenString, mcpConfigPath: undefined }
  },

  buildOptions(props, ctx) {
    const options: OpenCodeExecutionOptions = {
      prompt: ctx.prompt,
    }

    if (props.model !== undefined) options.model = props.model
    if (props.agent !== undefined) options.agent = props.agent
    if (props.permissionMode !== undefined) options.permissionMode = props.permissionMode
    if (ctx.cwd !== undefined) options.cwd = ctx.cwd
    if (props.resumeSession !== undefined) options.resumeSession = props.resumeSession
    if (props.systemPrompt !== undefined) options.systemPrompt = props.systemPrompt
    if (props.toolConfig !== undefined) options.toolConfig = props.toolConfig
    if (props.maxTurns !== undefined) options.maxTurns = props.maxTurns
    if (props.maxTokens !== undefined) options.maxTokens = props.maxTokens
    if (props.timeout !== undefined) options.timeout = props.timeout
    if (props.hostname !== undefined) options.hostname = props.hostname
    if (props.port !== undefined) options.port = props.port
    if (props.serverTimeout !== undefined) options.serverTimeout = props.serverTimeout
    if (props.onToolCall !== undefined) options.onToolCall = props.onToolCall

    return options
  },

  async execute(options): Promise<AgentResult> {
    const result = await executeOpenCode(options)
    if (result.stopReason === 'error') {
      throw new Error(result.output || 'OpenCode execution failed')
    }
    return result
  },

  createMessageParser(maxEntries) {
    return new OpenCodeMessageParserWrapper(maxEntries)
  },

  supportsTypedStreaming(_props: OpenCodeProps) {
    return false // OpenCode SDK uses SSE events, not typed streaming yet
  },
}

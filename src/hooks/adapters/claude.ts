// Claude agent adapter
import type { AgentAdapter, MessageParserInterface } from './types.js'
import type { ClaudeProps, CLIExecutionOptions, AgentResult } from '../../components/agents/types.js'
import { executeClaudeCLI } from '../../components/agents/ClaudeCodeCLI.js'
import { extractMCPConfigs, generateMCPServerConfig, writeMCPConfigFile } from '../../utils/mcp-config.js'
import { MessageParser } from '../../components/agents/claude-cli/message-parser.js'
import { ClaudeStreamParser } from '../../streaming/claude-parser.js'

class ClaudeMessageParserWrapper implements MessageParserInterface {
  private parser: MessageParser
  constructor(maxEntries: number) { this.parser = new MessageParser(maxEntries) }
  parseChunk(chunk: string): void { this.parser.parseChunk(chunk) }
  flush(): void { this.parser.flush() }
  getLatestEntries(n: number) { return this.parser.getLatestEntries(n) }
}

export const ClaudeAdapter: AgentAdapter<ClaudeProps, CLIExecutionOptions> = {
  name: 'claude',
  getAgentLabel(options) { return options.model ?? 'sonnet' },
  getLoggerName() { return 'Claude' },
  getLoggerContext(props) { return { model: props.model ?? 'sonnet' } },
  async extractPrompt(childrenString, props): Promise<{ prompt: string; mcpConfigPath: string | undefined }> {
    const { configs: mcpConfigs, cleanPrompt, toolInstructions } = extractMCPConfigs(childrenString)
    let prompt = cleanPrompt
    if (toolInstructions) prompt = `${toolInstructions}\n\n---\n\n${cleanPrompt}`
    let mcpConfigPath: string | undefined = props.mcpConfig
    if (mcpConfigs.length > 0) {
      const mcpConfig = generateMCPServerConfig(mcpConfigs)
      mcpConfigPath = await writeMCPConfigFile(mcpConfig)
    }
    return { prompt, mcpConfigPath }
  },
  buildOptions(props, ctx) {
    const options: CLIExecutionOptions = { prompt: ctx.prompt }
    if (props.model !== undefined) options.model = props.model
    if (props.permissionMode !== undefined) options.permissionMode = props.permissionMode
    if (props.maxTurns !== undefined) options.maxTurns = props.maxTurns
    if (props.systemPrompt !== undefined) options.systemPrompt = props.systemPrompt
    if (props.outputFormat !== undefined) options.outputFormat = props.outputFormat
    if (ctx.mcpConfigPath !== undefined) options.mcpConfig = ctx.mcpConfigPath
    if (props.allowedTools !== undefined) options.allowedTools = props.allowedTools
    if (props.disallowedTools !== undefined) options.disallowedTools = props.disallowedTools
    if (ctx.cwd !== undefined) options.cwd = ctx.cwd
    if (props.timeout !== undefined) options.timeout = props.timeout
    if (props.stopConditions !== undefined) options.stopConditions = props.stopConditions
    if (props.continueConversation !== undefined) options.continue = props.continueConversation
    if (props.resumeSession !== undefined) options.resume = props.resumeSession
    if (props.onToolCall !== undefined) options.onToolCall = props.onToolCall
    if (props.schema !== undefined) options.schema = props.schema
    if (props.schemaRetries !== undefined) options.schemaRetries = props.schemaRetries
    if (props.useSubscription !== undefined) options.useSubscription = props.useSubscription
    return options
  },
  async execute(options): Promise<AgentResult> {
    const result = await executeClaudeCLI(options)
    if (result.stopReason === 'error') throw new Error(result.output || 'Claude CLI execution failed')
    return result
  },
  createMessageParser(maxEntries) { return new ClaudeMessageParserWrapper(maxEntries) },
  createStreamParser() { return new ClaudeStreamParser() },
  supportsTypedStreaming(props: ClaudeProps) {
    const p = props as unknown as Record<string, unknown>
    return ((p['experimentalTypedStreaming'] as boolean | undefined) ?? false) || props.onStreamPart !== undefined
  },
  getDefaultOutputFormat(props: ClaudeProps) {
    const p = props as unknown as Record<string, unknown>
    const typedStreaming = ((p['experimentalTypedStreaming'] as boolean | undefined) ?? false) || props.onStreamPart !== undefined
    if (typedStreaming && props.outputFormat === undefined) return 'stream-json'
    return undefined
  },
}

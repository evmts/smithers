// Codex agent adapter
import type { AgentAdapter, MessageParserInterface } from './types.js'
import type { CodexProps, CodexCLIExecutionOptions } from '../../components/agents/types/codex.js'
import type { AgentResult } from '../../components/agents/types/execution.js'
import { executeCodexCLI } from '../../components/agents/codex-cli/index.js'
import { MessageParser } from '../../components/agents/claude-cli/message-parser.js'

class CodexMessageParserWrapper implements MessageParserInterface {
  private parser: MessageParser
  constructor(maxEntries: number) { this.parser = new MessageParser(maxEntries) }
  parseChunk(chunk: string): void { this.parser.parseChunk(chunk) }
  flush(): void { this.parser.flush() }
  getLatestEntries(n: number) { return this.parser.getLatestEntries(n) }
}

export const CodexAdapter: AgentAdapter<CodexProps, CodexCLIExecutionOptions> = {
  name: 'codex',
  getAgentLabel(options) { return options.model ?? 'o4-mini' },
  getLoggerName() { return 'Codex' },
  getLoggerContext(props) { return { model: props.model ?? 'o4-mini' } },
  extractPrompt(childrenString): { prompt: string; mcpConfigPath: string | undefined } {
    return { prompt: childrenString, mcpConfigPath: undefined }
  },
  buildOptions(props, ctx) {
    const options: CodexCLIExecutionOptions = { prompt: ctx.prompt }
    if (props.model !== undefined) options.model = props.model
    if (props.sandboxMode !== undefined) options.sandboxMode = props.sandboxMode
    if (props.approvalPolicy !== undefined) options.approvalPolicy = props.approvalPolicy
    if (props.fullAuto !== undefined) options.fullAuto = props.fullAuto
    if (props.bypassSandbox !== undefined) options.bypassSandbox = props.bypassSandbox
    if (ctx.cwd !== undefined) options.cwd = ctx.cwd
    if (props.skipGitRepoCheck !== undefined) options.skipGitRepoCheck = props.skipGitRepoCheck
    if (props.addDirs !== undefined) options.addDirs = props.addDirs
    if (props.images !== undefined) options.images = props.images
    if (props.profile !== undefined) options.profile = props.profile
    if (props.configOverrides !== undefined) options.configOverrides = props.configOverrides
    if (props.timeout !== undefined) options.timeout = props.timeout
    if (props.stopConditions !== undefined) options.stopConditions = props.stopConditions
    if (props.jsonOutput !== undefined) options.json = props.jsonOutput
    if (props.schema !== undefined) options.schema = props.schema
    if (props.schemaRetries !== undefined) options.schemaRetries = props.schemaRetries
    return options
  },
  async execute(options): Promise<AgentResult> {
    const result = await executeCodexCLI(options)
    if (result.stopReason === 'error') throw new Error(result.output || 'Codex CLI execution failed')
    return result
  },
  createMessageParser(maxEntries) { return new CodexMessageParserWrapper(maxEntries) },
  createStreamParser() { return null },
  supportsTypedStreaming() { return false },
}

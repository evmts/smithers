import type { AgentAdapter, MessageParserInterface, ExtractPromptResult } from './types.js'
import type { PiProps, PiCLIExecutionOptions } from '../../components/agents/types/pi.js'
import type { AgentResult } from '../../components/agents/types/execution.js'
import { executePiCLI } from '../../components/agents/pi-cli/executor.js'
import { PiStreamParser } from '../../streaming/pi-parser.js'
import { MessageParser } from '../../components/agents/claude-cli/message-parser.js'

const PI_BUILTIN_TOOLS = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls']

class PiMessageParserWrapper implements MessageParserInterface {
  private parser: MessageParser
  constructor(maxEntries: number) { this.parser = new MessageParser(maxEntries) }
  parseChunk(chunk: string): void { this.parser.parseChunk(chunk) }
  flush(): void { this.parser.flush() }
  getLatestEntries(n: number) { return this.parser.getLatestEntries(n) }
}

export const PiAdapter: AgentAdapter<PiProps, PiCLIExecutionOptions> = {
  name: 'pi',
  
  getAgentLabel(options) { return options.model ?? 'pi' },
  getLoggerName() { return 'Pi' },
  getLoggerContext(props) { return { model: props.model ?? 'default', provider: props.provider ?? '' } },

  extractPrompt(childrenString, _props): ExtractPromptResult {
    // Pi doesn't use MCP configs in prompt - just pass through
    return { prompt: childrenString, mcpConfigPath: undefined }
  },

  buildOptions(props, ctx) {
    // Filter tools to pi builtins only
    const tools = ctx.builtinTools?.filter(t => PI_BUILTIN_TOOLS.includes(t))
    
    return {
      prompt: ctx.prompt,
      ...(props.provider ? { provider: props.provider } : {}),
      ...(props.model ? { model: props.model } : {}),
      ...(props.thinking ? { thinking: props.thinking } : {}),
      ...(props.systemPrompt ? { systemPrompt: props.systemPrompt } : {}),
      ...(props.appendSystemPrompt ? { appendSystemPrompt: props.appendSystemPrompt } : {}),
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(props.timeout !== undefined ? { timeout: props.timeout } : {}),
      ...(ctx.cwd ? { cwd: ctx.cwd } : {}),
      ...(props.stopConditions ? { stopConditions: props.stopConditions } : {}),
    }
  },

  async execute(options): Promise<AgentResult> {
    const result = await executePiCLI(options)
    if (result.stopReason === 'error') {
      throw new Error(result.output || 'Pi CLI execution failed')
    }
    return result
  },

  createMessageParser(maxEntries) {
    return new PiMessageParserWrapper(maxEntries)
  },

  createStreamParser() {
    return new PiStreamParser()
  },

  supportsTypedStreaming(_props) {
    return true  // Pi always outputs JSON in --mode json
  },

  getDefaultOutputFormat(_props) {
    return undefined  // Not applicable - pi manages its own format
  },
}

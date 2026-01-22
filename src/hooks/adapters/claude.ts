// Claude agent adapter
import type { AgentAdapter, MessageParserInterface } from './types.js'
import type { ClaudeProps, CLIExecutionOptions, AgentResult } from '../../components/agents/types.js'
import { executeClaudeCLI } from '../../components/agents/ClaudeCodeCLI.js'
import { extractMCPConfigs, generateMCPServerConfig, writeMCPConfigFile } from '../../utils/mcp-config.js'
import { MessageParser } from '../../components/agents/claude-cli/message-parser.js'
import { ClaudeStreamParser } from '../../streaming/claude-parser.js'
import { parseToolSpecs } from '../../tools/registry.js'
import { createSmithersToolServer } from '../../tools/tool-to-mcp.js'
import { createLegacyToolServer } from '../../tools/legacy-tool-server.js'
import {
  registerHandlers as registerLegacyHandlers,
  startWatcher as startLegacyIpcWatcher,
  stopWatcher as stopLegacyIpcWatcher,
  cleanupIpcDir,
} from '../../tools/legacy-tool-ipc.js'

// Track if legacy tools are in use for current execution
let hasLegacyToolsInExecution = false
import type { MCPServer } from '../../tools/types.js'
import * as path from 'path'

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
  async extractPrompt(childrenString, props): Promise<{ prompt: string; mcpConfigPath: string | undefined; builtinTools?: string[]; hasLegacyTools?: boolean }> {
    const { configs: mcpConfigs, cleanPrompt, toolInstructions } = extractMCPConfigs(childrenString)
    let prompt = cleanPrompt
    if (toolInstructions) prompt = `${toolInstructions}\n\n---\n\n${cleanPrompt}`

    // Parse tools prop to categorize tools
    const toolsFromProp = props.tools ?? []
    const { builtinTools, mcpServers, smithersTools, legacyTools } = parseToolSpecs(toolsFromProp)

    // Collect all MCP servers: from extractMCPConfigs + tools prop MCPServers + SmithersTools + LegacyTools
    const allMcpServers: MCPServer[] = [...mcpServers]

    // Convert SmithersTools to MCP server if any exist
    if (smithersTools.length > 0) {
      const toolsRecord: Record<string, typeof smithersTools[number]> = {}
      for (const tool of smithersTools) {
        toolsRecord[tool.name] = tool
      }
      const serverPath = path.resolve(import.meta.dirname, '../../tools/smithers-mcp-server.ts')
      const smithersMcpServer = createSmithersToolServer(toolsRecord, serverPath)
      allMcpServers.push(smithersMcpServer)
    }

    // Convert LegacyTools to MCP server if any exist
    // LegacyTools use IPC to execute handlers in the parent process
    let hasLegacyTools = false
    if (legacyTools.length > 0) {
      hasLegacyTools = true
      // Register handlers for IPC execution
      registerLegacyHandlers(legacyTools)
      // Create MCP server config
      const { server } = createLegacyToolServer(legacyTools)
      allMcpServers.push(server)
    }

    // Generate MCP config file if needed
    let mcpConfigPath: string | undefined = props.mcpConfig
    if (mcpConfigs.length > 0 || allMcpServers.length > 0) {
      // Start with config from extractMCPConfigs
      const mcpConfig = mcpConfigs.length > 0 ? generateMCPServerConfig(mcpConfigs) : { mcpServers: {} }

      // Add MCPServers from tools prop
      for (const server of allMcpServers) {
        const serverConfig: Record<string, unknown> = {
          command: server.command,
        }
        if (server.args) serverConfig['args'] = server.args
        if (server.env) serverConfig['env'] = server.env
        mcpConfig['mcpServers'][server.name] = serverConfig
      }

      mcpConfigPath = await writeMCPConfigFile(mcpConfig)
    }

    const result: { prompt: string; mcpConfigPath: string | undefined; builtinTools?: string[]; hasLegacyTools?: boolean } = { prompt, mcpConfigPath }
    if (builtinTools.length > 0) result.builtinTools = builtinTools
    if (hasLegacyTools) {
      result.hasLegacyTools = true
      hasLegacyToolsInExecution = true
    }
    return result
  },
  buildOptions(props, ctx) {
    const options: CLIExecutionOptions = { prompt: ctx.prompt }
    if (props.model !== undefined) options.model = props.model
    if (props.permissionMode !== undefined) options.permissionMode = props.permissionMode
    if (props.maxTurns !== undefined) options.maxTurns = props.maxTurns
    if (props.systemPrompt !== undefined) options.systemPrompt = props.systemPrompt
    if (props.outputFormat !== undefined) options.outputFormat = props.outputFormat
    if (ctx.mcpConfigPath !== undefined) options.mcpConfig = ctx.mcpConfigPath
    
    // Merge allowedTools: props.allowedTools + builtinTools from tools prop
    const mergedAllowedTools = [
      ...(props.allowedTools ?? []),
      ...(ctx.builtinTools ?? []),
    ]
    if (mergedAllowedTools.length > 0) {
      options.allowedTools = [...new Set(mergedAllowedTools)] // dedupe
    }
    
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
    if (props.maxTokens !== undefined) options.maxTokens = props.maxTokens
    return options
  },
  async execute(options): Promise<AgentResult> {
    // Start IPC watcher if we have legacy tools
    if (hasLegacyToolsInExecution) {
      await startLegacyIpcWatcher()
    }

    try {
      const result = await executeClaudeCLI(options)
      if (result.stopReason === 'error') throw new Error(result.output || 'Claude CLI execution failed')
      return result
    } finally {
      // Stop IPC watcher and cleanup
      if (hasLegacyToolsInExecution) {
        await stopLegacyIpcWatcher()
        await cleanupIpcDir()
        hasLegacyToolsInExecution = false
      }
    }
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

// Barrel export for agent types
// Re-exports all types from the split type files

export type { JSONSchema } from './schema.js'

export type { ToolContext, Tool, MCPServer, SmithersTool, LegacyTool, ToolSpec } from './tools.js'

export type {
  BaseAgentProps,
  ClaudeProps,
  ClaudeModel,
  ClaudePermissionMode,
  ClaudeOutputFormat,
  StopCondition,
} from './agents.js'

export type {
  CLIExecutionOptions,
  AgentResult,
  StopConditionType,
  StopReason,
} from './execution.js'

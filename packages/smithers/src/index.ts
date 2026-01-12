// Core rendering and execution
export { renderPlan, createRoot, serialize } from './core/render.js'
export {
  executePlan,
  executeNode,
  findPendingExecutables,
  findStopNode,
  findHumanNode,
  findPendingFileNodes,
  executeFileNode,
  findPendingWorktreeNodes,
  executeWorktreeNode,
  cleanupWorktreeNode,
  getWorktreePath,
  type ExecuteNodeResult,
} from './core/execute.js'
export {
  executeWithClaude,
  createExecutionError,
  getNodePath,
  type ClaudeConfig,
  RateLimitError,
} from './core/claude-executor.js'

// Components
export {
  Claude,
  ClaudeApi,
  ClaudeCli,
  Subagent,
  Phase,
  Step,
  Persona,
  Constraints,
  Task,
  Stop,
  Human,
  Output,
  OutputFormat,
  File,
  Worktree,
} from './components/index.js'

// Claude Agent SDK executor
export { executeWithAgentSdk, executeAgentMock } from './core/claude-agent-executor.js'

// Claude CLI executor (deprecated)
export { executeWithClaudeCli } from './core/claude-cli-executor.js'

// Nested execution utilities
export {
  separatePromptAndPlan,
  hasPlan,
  generateNodePaths,
  findNodeByPath,
  getExecutableNodePaths,
  serializePlanWithPaths,
  createRenderNodeTool,
  buildPlanSystemPrompt,
} from './core/nested-execution.js'
export type { PromptAndPlan, RenderNodeResult } from './core/nested-execution.js'

// Types
export type {
  SmithersNode,
  SmithersRoot,
  ExecutionState,
  ExecutionController,
  ExecutionError,
  Tool,
  ToolInputSchema,
  ToolRetryOptions,
  ToolExecutionResult,
  ClaudeProps,
  ClaudeApiProps,
  ClaudeCliProps,
  PermissionMode,
  AgentDefinition,
  JsonSchemaOutputFormat,
  SubagentProps,
  PhaseProps,
  StepProps,
  PersonaProps,
  ConstraintsProps,
  TaskProps,
  StopProps,
  HumanProps,
  OutputProps,
  OutputFormatProps,
  FileProps,
  WorktreeProps,
  ExecuteOptions,
  ExecutionResult,
  FrameResult,
  PlanInfo,
  ProviderContext,
} from './core/types.js'

// ClaudeProvider context (rate limiting, usage tracking, default props)
export {
  ClaudeProvider,
  ClaudeContext,
  useClaudeContext,
  useClaudeContextOptional,
  TokenBucketRateLimiter,
  UsageTracker,
  BudgetExceededError,
} from './context/index.js'
export { RateLimitError as ProviderRateLimitError } from './context/index.js'
export type {
  ClaudeProviderProps,
  ClaudeDefaultProps,
  ClaudeProviderEvents,
  ClaudeContextValue,
  RateLimitConfig,
  TokenBucketState,
  UsageLimitConfig,
  UsageStats,
  UsageReport,
  TokenEstimate,
  BudgetCheckResult,
  StorageAdapter,
} from './context/index.js'

// MCP (Model Context Protocol) integration
export { MCPManager, MCPPresets, createMCPConfigs } from './mcp/index.js'
export type {
  MCPServerConfig,
  MCPStdioConfig,
  MCPHttpConfig,
  MCPTransportType,
  MCPConnection,
  MCPConnectionStatus,
  MCPTool,
  MCPToolResult,
} from './mcp/index.js'

// Debug observability
export { DebugCollector } from './debug/collector.js'
export {
  formatAsCompact,
  formatAsJson,
  formatAsPrettyTerminal,
  formatTreeAsAscii,
  formatByFrame,
} from './debug/formatters.js'
export type {
  DebugOptions,
  SmithersDebugEvent,
  SmithersDebugEventType,
  SmithersNodeSnapshot,
  PluNodeSnapshot,
  DebugSummary,
  TimelineEntry,
  ExecutionStatus,
  FrameStartEvent,
  FrameEndEvent,
  FrameRenderEvent,
  NodeFoundEvent,
  NodeExecuteStartEvent,
  NodeExecuteEndEvent,
  CallbackInvokedEvent,
  StateChangeEvent,
  StopNodeDetectedEvent,
  HumanNodeDetectedEvent,
  LoopTerminatedEvent,
} from './debug/types.js'

// Workflow system
export { createWorkflow, findWorkflowOutputs, zodSchemaToToolSchema, getWorkflowStoreFromTree } from './workflow/index.js'
export type {
  Workflow,
  WorkflowStore,
  CreateWorkflowOptions,
  WorkflowOutputProps,
  HumanPromptInfo,
  HumanPromptResponse,
} from './workflow/index.js'

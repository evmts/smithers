import { splitProps, type Component, type JSX } from 'solid-js'

export interface ExecutionError extends Error {
  nodeType: string
  nodePath: string
  input?: string
  failedTool?: string
  toolInput?: unknown
  retriesAttempted?: number
  cause?: Error
}

export interface ToolRetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  exponentialBackoff?: boolean
  skipOnFailure?: string[]
  continueOnToolFailure?: boolean
}

export interface ToolInputSchema {
  type: 'object'
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

export interface Tool {
  name: string
  description: string
  input_schema?: ToolInputSchema
  parameters?: Record<string, unknown>
  execute?: (args: unknown) => Promise<unknown>
}

export interface StreamChunk {
  type:
    | 'text'
    | 'tool_use'
    | 'message_start'
    | 'message_delta'
    | 'content_block_start'
    | 'content_block_delta'
    | 'content_block_stop'
  text?: string
  tool_use?: {
    id: string
    name: string
    input: unknown
  }
  delta?: {
    text?: string
    stop_reason?: string
  }
}

export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'
  | 'dontAsk'

export interface AgentDefinition {
  description: string
  tools?: string[]
  disallowedTools?: string[]
  prompt: string
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit'
}

export type MCPTransportType = 'stdio' | 'http'

export interface MCPStdioConfig {
  type: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}

export interface MCPHttpConfig {
  type: 'http'
  url: string
  headers?: Record<string, string>
}

export interface MCPServerConfig {
  name: string
  transport: MCPStdioConfig | MCPHttpConfig
  autoConnect?: boolean
  timeout?: number
}

export interface ClaudeProps<T = unknown> {
  onFinished?: (output: T) => void
  onError?: (error: Error | ExecutionError) => void
  children?: JSX.Element
  allowedTools?: string[]
  disallowedTools?: string[]
  tools?: string[] | { type: 'preset'; preset: 'claude_code' }
  model?: string
  maxTurns?: number
  maxBudgetUsd?: number
  maxThinkingTokens?: number
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string }
  permissionMode?: PermissionMode
  allowDangerouslySkipPermissions?: boolean
  cwd?: string
  mcpServers?: Record<string, MCPServerConfig>
  agents?: Record<string, AgentDefinition>
  schema?: T
  resume?: string
  additionalDirectories?: string[]
  settingSources?: Array<'user' | 'project' | 'local'>
  [key: string]: unknown
}

export interface ClaudeApiProps<T = unknown> {
  tools?: Tool[]
  onFinished?: (output: T) => void
  onError?: (error: Error | ExecutionError) => void
  onToolError?: (toolName: string, error: Error, input: unknown) => void
  children?: JSX.Element
  system?: string
  maxToolIterations?: number
  stream?: boolean
  onStream?: (chunk: StreamChunk) => void
  mcpServers?: MCPServerConfig[]
  retries?: number
  toolRetry?: ToolRetryOptions
  schema?: T
  [key: string]: unknown
}

export interface ClaudeCliProps {
  onFinished?: (output: string) => void
  onError?: (error: Error) => void
  model?: string
  cwd?: string
  allowedTools?: string[]
  maxTurns?: number
  systemPrompt?: string
  children?: JSX.Element
}

export interface SubagentProps {
  name?: string
  parallel?: boolean
  children?: JSX.Element
}

export interface PhaseProps {
  name: string
  completed?: boolean
  children?: JSX.Element
}

export interface StepProps {
  completed?: boolean
  children?: JSX.Element
}

export interface PersonaProps {
  role: string
  children?: JSX.Element
}

export interface ConstraintsProps {
  children?: JSX.Element
}

export interface TaskProps {
  done?: boolean
  children?: JSX.Element
}

export interface OutputFormatProps {
  schema?: Record<string, unknown>
  children?: JSX.Element
}

export interface HumanProps {
  message?: string
  onApprove?: () => void
  onReject?: () => void
  children?: JSX.Element
}

export interface StopProps {
  reason?: string
  children?: JSX.Element
}

export interface OutputProps {
  format?: 'text' | 'json' | 'markdown'
  label?: string
  children?: JSX.Element
}

export interface FileProps {
  path: string
  mode?: 'write' | 'append'
  encoding?: BufferEncoding
  createDirs?: boolean
  onWritten?: (path: string) => void
  onError?: (error: Error) => void
  children?: JSX.Element
  _mockMode?: boolean
  [key: string]: unknown
}

export interface WorktreeProps {
  path: string
  branch?: string
  cleanup?: boolean
  baseBranch?: string
  onCreated?: (path: string, branch?: string) => void
  onError?: (error: Error) => void
  onCleanup?: (path: string) => void
  children?: JSX.Element
  [key: string]: unknown
}

// Declare lowercase JSX intrinsic elements for the host components
declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      claude: ClaudeProps
      'claude-api': ClaudeApiProps
      'claude-cli': ClaudeCliProps
      subagent: SubagentProps
      phase: PhaseProps
      step: StepProps
      persona: PersonaProps
      constraints: ConstraintsProps
      task: TaskProps
      'output-format': OutputFormatProps
      human: HumanProps
      stop: StopProps
      output: OutputProps
      file: FileProps
      worktree: WorktreeProps
    }
  }
}

export const Claude: Component<ClaudeProps> = (props) => {
  const [local, rest] = splitProps(props, ['children'])
  return <claude {...rest}>{local.children}</claude>
}

export const ClaudeApi: Component<ClaudeApiProps> = (props) => {
  const [local, rest] = splitProps(props, ['children'])
  return <claude-api {...rest}>{local.children}</claude-api>
}

export const ClaudeCli: Component<ClaudeCliProps> = (props) => {
  const [local, rest] = splitProps(props, ['children'])
  return <claude-cli {...rest}>{local.children}</claude-cli>
}

export const Subagent: Component<SubagentProps> = (props) => {
  const [local, rest] = splitProps(props, ['children', 'parallel'])
  return (
    <subagent parallel={local.parallel ?? true} {...rest}>
      {local.children}
    </subagent>
  )
}

export const Phase: Component<PhaseProps> = (props) => {
  const [local, rest] = splitProps(props, ['children'])
  return <phase {...rest}>{local.children}</phase>
}

export const Step: Component<StepProps> = (props) => {
  const [local, rest] = splitProps(props, ['children'])
  return <step {...rest}>{local.children}</step>
}

export const Persona: Component<PersonaProps> = (props) => {
  const [local, rest] = splitProps(props, ['children'])
  return <persona {...rest}>{local.children}</persona>
}

export const Constraints: Component<ConstraintsProps> = (props) => {
  const [local, rest] = splitProps(props, ['children'])
  return <constraints {...rest}>{local.children}</constraints>
}

export const Task: Component<TaskProps> = (props) => {
  const [local, rest] = splitProps(props, ['children'])
  return <task {...rest}>{local.children}</task>
}

export const OutputFormat: Component<OutputFormatProps> = (props) => {
  const [local, rest] = splitProps(props, ['children'])
  return <output-format {...rest}>{local.children}</output-format>
}

export const Human: Component<HumanProps> = (props) => {
  const [local, rest] = splitProps(props, ['children'])
  return <human {...rest}>{local.children}</human>
}

export const Stop: Component<StopProps> = (props) => {
  const [local, rest] = splitProps(props, ['children'])
  return <stop {...rest}>{local.children}</stop>
}

export const Output: Component<OutputProps> = (props) => {
  const [local, rest] = splitProps(props, ['children'])
  return <output {...rest}>{local.children}</output>
}

export const File: Component<FileProps> = (props) => {
  const [local, rest] = splitProps(props, ['children'])
  return <file {...rest}>{local.children}</file>
}

export const Worktree: Component<WorktreeProps> = (props) => {
  const [local, rest] = splitProps(props, ['children'])
  return <worktree {...rest}>{local.children}</worktree>
}

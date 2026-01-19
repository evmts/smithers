import type { z } from 'zod'
import type { SmithersDB } from '../db/index.js'
import type { JSONSchema } from '../components/agents/types/schema.js'

export interface SmithersToolContext {
  db: SmithersDB
  agentId: string
  executionId: string
  cwd: string
  env: Record<string, string>
  log: (message: string) => void
}

export interface SmithersTool<
  TInput extends z.ZodType = z.ZodType,
  TOutput = unknown
> {
  name: string
  description: string
  inputSchema: TInput
  outputSchema?: z.ZodType<TOutput>
  requiresSmithersContext?: boolean
  needsApproval?: boolean | ((input: z.infer<TInput>) => boolean | Promise<boolean>)
  execute: (input: z.infer<TInput>, options?: ToolExecuteOptions) => Promise<TOutput>
}

export interface ToolExecuteOptions {
  abortSignal?: AbortSignal
  smithers?: SmithersToolContext
  experimental_context?: SmithersToolContext
  toolCallId?: string
  messages?: unknown[]
  [key: string]: unknown
}

export type SmithersExecOptions = ToolExecuteOptions

export interface CreateSmithersToolOptions<
  TInput extends z.ZodType,
  TOutput
> {
  name: string
  description: string
  inputSchema: TInput
  outputSchema?: z.ZodType<TOutput>
  requiresSmithersContext?: boolean
  execute: (
    input: z.infer<TInput>,
    context: SmithersToolContext & { abortSignal?: AbortSignal }
  ) => Promise<TOutput>
  needsApproval?: boolean | ((input: z.infer<TInput>) => boolean | Promise<boolean>)
}

export interface MCPServer {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface LegacyTool {
  name: string
  description: string
  inputSchema: JSONSchema
  execute: (input: any, context: SmithersToolContext) => Promise<any>
}

export type ToolSpec =
  | string
  | SmithersTool
  | MCPServer
  | LegacyTool

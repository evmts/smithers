import type { z } from 'zod'
import type { CoreTool } from 'ai'
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

export type SmithersTool<
  TInput extends z.ZodType = z.ZodType,
  TOutput = unknown
> = CoreTool<TInput, TOutput> & {
  name: string
  description: string
  inputSchema: TInput
  outputSchema?: z.ZodType<TOutput>
}

export interface CreateSmithersToolOptions<
  TInput extends z.ZodType,
  TOutput
> {
  name: string
  description: string
  inputSchema: TInput
  outputSchema?: z.ZodType<TOutput>
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

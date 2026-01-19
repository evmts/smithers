import type { z } from 'zod'
import type {
  CreateSmithersToolOptions,
  SmithersTool,
  SmithersToolContext,
} from './types.js'

/**
 * Create a SmithersTool from options.
 * 
 * When used within the Smithers orchestrator, tools receive full context including
 * database access, agent/execution IDs, and proper logging. When used standalone
 * (e.g., MCP server, direct invocation, testing), a stub context is created with:
 * - Empty db object (tools should handle gracefully)
 * - 'stub' agentId/executionId
 * - process.cwd() and process.env
 * - console.log for logging
 * 
 * This intentional fallback enables tools to work in MCP/standalone contexts
 * where full Smithers orchestration isn't available.
 * 
 * @param options - Tool configuration including name, schema, and execute function
 * @returns A SmithersTool compatible with both Smithers orchestration and standalone use
 * 
 * @example
 * ```ts
 * const myTool = createSmithersTool({
 *   name: 'my-tool',
 *   description: 'Does something useful',
 *   inputSchema: z.object({ value: z.string() }),
 *   execute: async (input, context) => {
 *     context.log(`Processing: ${input.value}`)
 *     return { result: input.value.toUpperCase() }
 *   }
 * })
 * ```
 */
export function createSmithersTool<TInput extends z.ZodType, TOutput>(
  options: CreateSmithersToolOptions<TInput, TOutput>
): SmithersTool<TInput, TOutput> {
  const { name, inputSchema, outputSchema, execute, description } = options

  return {
    name,
    description,
    inputSchema,
    ...(outputSchema ? { outputSchema } : {}),
    execute: async (input: z.infer<TInput>, execOptions: Record<string, unknown>) => {
      const smithersContext =
        (execOptions as { smithers?: SmithersToolContext }).smithers ??
        (execOptions as { experimental_context?: SmithersToolContext }).experimental_context
      
      const abortSignal = execOptions['abortSignal'] as AbortSignal | undefined
      
      // When no Smithers context provided (MCP/standalone usage), create stub context.
      // This enables tools to work outside full orchestration - tools should handle
      // empty db gracefully for standalone compatibility.
      const context: SmithersToolContext & { abortSignal?: AbortSignal } = smithersContext 
        ? {
            ...smithersContext,
            ...(abortSignal ? { abortSignal } : {}),
          }
        : {
            db: {} as SmithersToolContext['db'],
            agentId: 'stub',
            executionId: 'stub',
            cwd: process.cwd(),
            env: process.env as Record<string, string>,
            log: console.log,
            ...(abortSignal ? { abortSignal } : {}),
          }
      
      return execute(input, context)
    },
  }
}

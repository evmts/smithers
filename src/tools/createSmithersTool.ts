import type { z } from 'zod'
import type {
  CreateSmithersToolOptions,
  SmithersTool,
  SmithersToolContext,
  ToolExecuteOptions,
} from './types.js'

/**
 * Create a SmithersTool from options.
 *
 * When used within the Smithers orchestrator, tools receive full context including
 * database access, agent/execution IDs, and proper logging. When used standalone
 * (e.g., MCP server, direct invocation, testing), a stub context is created with:
 * - db proxy that throws on access (explicit error for missing orchestration context)
 * - 'stub' agentId/executionId
 * - process.cwd() and process.env
 * - console.log for logging
 *
 * This intentional fallback enables tools to work in MCP/standalone contexts
 * where full Smithers orchestration isn't available. Tools can opt out by
 * setting requiresSmithersContext: true.
 *
 * @param options - Tool configuration including name, schema, and execute function
 * @returns A SmithersTool compatible with both Smithers orchestration and standalone use
 *
 * @throws {Error} When `requiresSmithersContext: true` and no Smithers context provided
 * @throws {Error} When accessing `context.db` in standalone mode (db unavailable)
 * @throws {Error} When input fails Zod schema validation
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
  const {
    name,
    inputSchema,
    outputSchema,
    execute,
    description,
    needsApproval,
    requiresSmithersContext,
  } = options

  return {
    name,
    description,
    inputSchema,
    ...(outputSchema ? { outputSchema } : {}),
    ...(needsApproval !== undefined ? { needsApproval } : {}),
    ...(requiresSmithersContext ? { requiresSmithersContext } : {}),
    execute: async (input: z.infer<TInput>, execOptions: ToolExecuteOptions = {}) => {
      const smithersContext =
        execOptions.smithers ?? execOptions.experimental_context
      
      const abortSignal = execOptions.abortSignal
      
      // When no Smithers context provided (MCP/standalone usage), create stub context.
      // db access throws a clear error; db-dependent tools should set requiresSmithersContext.
      if (!smithersContext && requiresSmithersContext) {
        throw new Error(
          `Tool ${name} requires Smithers context. Provide execOptions.smithers or execOptions.experimental_context.`
        )
      }
      const dbProxy = new Proxy({} as SmithersToolContext['db'], {
        get(_target, prop) {
          throw new Error(
            `SmithersToolContext.db is not available in standalone mode (attempted access: ${String(prop)}). ` +
              'Provide execOptions.smithers or execOptions.experimental_context with a real db.'
          )
        },
      })
      const context: SmithersToolContext & { abortSignal?: AbortSignal } = smithersContext 
        ? {
            ...smithersContext,
            ...(abortSignal ? { abortSignal } : {}),
          }
        : {
            db: dbProxy,
            agentId: 'stub',
            executionId: 'stub',
            cwd: process.cwd(),
            env: process.env as Record<string, string>,
            log: console.log,
            ...(abortSignal ? { abortSignal } : {}),
          }
      
      const parsed = inputSchema.safeParse(input)
      if (!parsed.success) {
        throw new Error(`Invalid tool input for ${name}: ${parsed.error.message}`)
      }

      return execute(parsed.data, context)
    },
  }
}

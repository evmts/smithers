import type { SmithersNode } from '../core/types.js'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { ZodType } from 'zod'

/**
 * Find all workflow-output nodes in a subtree
 *
 * @param node The root node to search from
 * @returns Array of workflow-output nodes found
 */
export function findWorkflowOutputs(node: SmithersNode): SmithersNode[] {
  const outputs: SmithersNode[] = []

  function walk(n: SmithersNode) {
    if (n.type === 'workflow-output') {
      outputs.push(n)
    }
    for (const child of n.children) {
      walk(child)
    }
  }

  walk(node)
  return outputs
}

/**
 * Convert a Zod schema to JSON Schema for Claude tools
 *
 * @param zodSchema The Zod schema to convert
 * @returns JSON Schema object suitable for tool input_schema
 */
export function zodSchemaToToolSchema(zodSchema: unknown): Record<string, unknown> {
  if (!zodSchema) {
    return {
      type: 'object',
      properties: {
        value: { type: 'string' },
      },
      required: ['value'],
    }
  }

  try {
    const jsonSchema = zodToJsonSchema(zodSchema as ZodType)

    if (typeof jsonSchema === 'object' && jsonSchema !== null && 'type' in jsonSchema) {
      if (
        jsonSchema.type === 'string' ||
        jsonSchema.type === 'number' ||
        jsonSchema.type === 'boolean' ||
        jsonSchema.type === 'integer'
      ) {
        return {
          type: 'object',
          properties: {
            value: jsonSchema,
          },
          required: ['value'],
        }
      }

      return {
        type: 'object',
        properties: {
          value: jsonSchema,
        },
        required: ['value'],
      }
    }

    return {
      type: 'object',
      properties: {
        value: jsonSchema,
      },
      required: ['value'],
    }
  } catch {
    return {
      type: 'object',
      properties: {
        value: { type: 'string' },
      },
      required: ['value'],
    }
  }
}

/**
 * Get the workflow store from a node's context
 *
 * This traverses up the tree looking for a workflow-provider node
 * and returns its store reference.
 *
 * @param node The node to start searching from
 * @param workflowId Optional workflow ID to match (for nested workflows)
 * @returns The workflow store if found, undefined otherwise
 */
export function getWorkflowStoreFromTree(
  node: SmithersNode,
  workflowId?: string
): { setValue: (name: string, value: unknown) => void } | undefined {
  let current: SmithersNode | null = node

  while (current) {
    if (current.type === 'workflow-provider' && current.props._store) {
      if (workflowId) {
        if (current.props._workflowId === workflowId) {
          return current.props._store as {
            setValue: (name: string, value: unknown) => void
          }
        }
      } else {
        return current.props._store as {
          setValue: (name: string, value: unknown) => void
        }
      }
    }
    current = current.parent
  }

  return undefined
}

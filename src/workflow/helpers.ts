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
    // Default to a simple string value wrapper
    return {
      type: 'object',
      properties: {
        value: { type: 'string' },
      },
      required: ['value'],
    }
  }

  try {
    // Convert Zod schema to JSON Schema
    const jsonSchema = zodToJsonSchema(zodSchema as ZodType)

    // If the schema is already an object type, wrap it in a value property
    // This ensures consistent tool interface: always call with { value: ... }
    if (
      typeof jsonSchema === 'object' &&
      jsonSchema !== null &&
      'type' in jsonSchema
    ) {
      // For primitive types (string, number, boolean), wrap in value
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

      // For object and array types, also wrap in value for consistency
      return {
        type: 'object',
        properties: {
          value: jsonSchema,
        },
        required: ['value'],
      }
    }

    // Fallback
    return {
      type: 'object',
      properties: {
        value: jsonSchema,
      },
      required: ['value'],
    }
  } catch {
    // Fallback for any conversion errors
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
  // Walk up the tree to find the workflow-provider
  let current: SmithersNode | null = node

  while (current) {
    if (current.type === 'workflow-provider' && current.props._store) {
      // If a workflow ID is specified, match it
      if (workflowId) {
        if (current.props._workflowId === workflowId) {
          return current.props._store as {
            setValue: (name: string, value: unknown) => void
          }
        }
        // Continue searching up the tree for the matching provider
      } else {
        // No specific ID, return the first provider found
        return current.props._store as {
          setValue: (name: string, value: unknown) => void
        }
      }
    }
    current = current.parent
  }

  return undefined
}

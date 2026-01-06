import type { SmithersNode } from './types.js'
import { createExecutionError, getNodePath } from './claude-executor.js'

/**
 * Execute a node using the Claude CLI
 *
 * Spawns the `claude` CLI process with the node content as the prompt.
 * Uses --print and --output-format text for non-interactive execution.
 *
 * @param node The node to execute (claude-cli type)
 * @returns The text response from Claude CLI
 * @throws {Error} If CLI execution fails
 *
 * @example
 * ```typescript
 * const response = await executeWithClaudeCli(claudeCliNode)
 * ```
 */
export async function executeWithClaudeCli(node: SmithersNode): Promise<string> {
  // Extract the prompt from the node
  const prompt = extractTextContent(node)

  // Build CLI arguments
  const args: string[] = ['claude', '--print', '--output-format', 'text']

  // Add model flag if specified
  const model = node.props.model as string | undefined
  if (model) {
    args.push('--model', model)
  }

  // Add max-turns flag if specified
  const maxTurns = node.props.maxTurns as number | undefined
  if (maxTurns !== undefined) {
    args.push('--max-turns', String(maxTurns))
  }

  // Add allowedTools flag if specified
  const allowedTools = node.props.allowedTools as string[] | undefined
  if (allowedTools && allowedTools.length > 0) {
    args.push('--allowedTools', allowedTools.join(','))
  }

  // Add system prompt flag if specified
  const systemPrompt = node.props.systemPrompt as string | undefined
  if (systemPrompt) {
    args.push('--system-prompt', systemPrompt)
  }

  // Add the prompt as the final positional argument
  args.push('--prompt', prompt)

  // Get working directory
  const cwd = (node.props.cwd as string | undefined) || process.cwd()

  // Get node path for error context
  const nodePath = getNodePath(node)

  try {
    // Spawn the CLI process
    const proc = Bun.spawn(args, {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    // Wait for process to complete
    const exitCode = await proc.exited

    // Collect stdout
    const stdoutReader = proc.stdout.getReader()
    const stdoutChunks: Uint8Array[] = []
    while (true) {
      const { done, value } = await stdoutReader.read()
      if (done) break
      stdoutChunks.push(value)
    }
    const stdout = new TextDecoder().decode(
      new Uint8Array(stdoutChunks.reduce((acc, chunk) => acc + chunk.length, 0))
    )

    // Collect stderr for error messages
    const stderrReader = proc.stderr.getReader()
    const stderrChunks: Uint8Array[] = []
    while (true) {
      const { done, value } = await stderrReader.read()
      if (done) break
      stderrChunks.push(value)
    }
    const stderr = new TextDecoder().decode(
      new Uint8Array(stderrChunks.reduce((acc, chunk) => acc + chunk.length, 0))
    )

    // Check for errors
    if (exitCode !== 0) {
      throw createExecutionError(
        `Claude CLI exited with code ${exitCode}${stderr ? `: ${stderr}` : ''}`,
        {
          nodeType: node.type,
          nodePath,
          input: prompt,
        }
      )
    }

    // Concatenate stdout chunks properly
    let totalLength = 0
    for (const chunk of stdoutChunks) {
      totalLength += chunk.length
    }
    const combined = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of stdoutChunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }

    return new TextDecoder().decode(combined).trim()
  } catch (error) {
    // Re-throw ExecutionError
    if ((error as { nodeType?: string }).nodeType) {
      throw error
    }

    // Wrap other errors with context
    throw createExecutionError(
      error instanceof Error ? error.message : String(error),
      {
        nodeType: node.type,
        nodePath,
        input: prompt,
        cause: error instanceof Error ? error : undefined,
      }
    )
  }
}

/**
 * Extract text content from a node's children
 * Converts the node tree to a prompt string
 */
function extractTextContent(node: SmithersNode): string {
  const parts: string[] = []

  function walk(n: SmithersNode): void {
    if (n.type === 'TEXT') {
      const value = n.props.value ?? n.props.children ?? ''
      parts.push(String(value))
      return
    }

    // Handle semantic components by wrapping in XML tags
    switch (n.type) {
      case 'persona':
        parts.push(`<persona role="${n.props.role}">`)
        for (const child of n.children) {
          walk(child)
        }
        parts.push('</persona>')
        break

      case 'constraints':
        parts.push('<constraints>')
        for (const child of n.children) {
          walk(child)
        }
        parts.push('</constraints>')
        break

      case 'output-format':
        parts.push('<output-format>')
        if (n.props.schema) {
          parts.push(`Schema: ${JSON.stringify(n.props.schema)}`)
        }
        for (const child of n.children) {
          walk(child)
        }
        parts.push('</output-format>')
        break

      case 'phase':
        parts.push(`<phase name="${n.props.name}">`)
        for (const child of n.children) {
          walk(child)
        }
        parts.push('</phase>')
        break

      case 'step':
        parts.push('<step>')
        for (const child of n.children) {
          walk(child)
        }
        parts.push('</step>')
        break

      case 'claude-cli':
        // For the root claude-cli node, just process children
        for (const child of n.children) {
          walk(child)
        }
        break

      default:
        // For unknown types, just process children
        for (const child of n.children) {
          walk(child)
        }
    }
  }

  walk(node)
  return parts.join('\n').trim()
}

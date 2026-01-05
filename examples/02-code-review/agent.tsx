/**
 * Code Review Agent Example
 *
 * Demonstrates tools, Constraints, and OutputFormat for structured responses.
 *
 * Run with: bun run examples/02-code-review/agent.tsx
 */
import {
  executePlan,
  Claude,
  Phase,
  Step,
  Constraints,
  OutputFormat,
  type Tool,
} from 'smithers'

// Define tools that the agent can use
// In a real application, these would have actual implementations
const fileSystemTool: Tool = {
  name: 'fileSystem',
  description: 'Read and write files in the repository',
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['read', 'write', 'list'],
        description: 'The file operation to perform',
      },
      path: {
        type: 'string',
        description: 'The file or directory path',
      },
      content: {
        type: 'string',
        description: 'Content to write (for write action)',
      },
    },
    required: ['action', 'path'],
  },
  execute: async (args: unknown) => {
    const { action, path } = args as { action: string; path: string }
    // Mock implementation
    if (action === 'read') {
      return { content: `// Contents of ${path}` }
    }
    return { success: true }
  },
}

const grepTool: Tool = {
  name: 'grep',
  description: 'Search for patterns in files',
  input_schema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The regex pattern to search for',
      },
      path: {
        type: 'string',
        description: 'Directory or file to search in',
      },
    },
    required: ['pattern'],
  },
  execute: async (args: unknown) => {
    const { pattern } = args as { pattern: string }
    return { matches: [], pattern }
  },
}

// The review output schema
const reviewSchema = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          category: { type: 'string', enum: ['bug', 'security', 'performance', 'style'] },
          description: { type: 'string' },
          suggestion: { type: 'string' },
        },
      },
    },
    summary: { type: 'string' },
    approvalRecommendation: { type: 'string', enum: ['approve', 'request_changes', 'comment'] },
  },
}

// The Code Review Agent
function CodeReviewAgent({ targetPath = '.' }: { targetPath?: string }) {
  return (
    <Claude tools={[fileSystemTool, grepTool]}>
      <Constraints>
        - Focus on bugs, security issues, and performance problems
        - Always provide specific line numbers when referencing code
        - Suggest concrete fixes, not vague recommendations
        - Be constructive and educational in feedback
        - Prioritize issues by severity
      </Constraints>

      <Phase name="discovery">
        <Step>List all files in the target directory: {targetPath}</Step>
        <Step>Identify recently modified files</Step>
      </Phase>

      <Phase name="analysis">
        <Step>Read each changed file</Step>
        <Step>Search for common vulnerability patterns</Step>
        <Step>Check for code style consistency</Step>
      </Phase>

      <Phase name="review">
        <Step>Categorize issues by severity</Step>
        <Step>Write specific suggestions for each issue</Step>
        <Step>Compile the final review</Step>
      </Phase>

      <OutputFormat schema={reviewSchema}>
        Return your review as a JSON object with:
        - `issues`: Array of found issues with file, line, severity, category, description, suggestion
        - `summary`: A brief summary of the overall code quality
        - `approvalRecommendation`: One of "approve", "request_changes", or "comment"
      </OutputFormat>
    </Claude>
  )
}

// Execute the agent
async function main() {
  const targetPath = process.argv[2] || './src'

  console.log(`Running Code Review Agent on: ${targetPath}\n`)

  const result = await executePlan(<CodeReviewAgent targetPath={targetPath} />, {
    verbose: true,
  })

  // Parse and display the structured output
  try {
    const review = typeof result.output === 'string'
      ? JSON.parse(result.output)
      : result.output

    console.log('\n--- Review Summary ---')
    console.log(review.summary)
    console.log('\nRecommendation:', review.approvalRecommendation)
    console.log('\nIssues found:', review.issues?.length || 0)

    if (review.issues?.length > 0) {
      console.log('\n--- Issues ---')
      for (const issue of review.issues) {
        console.log(`\n[${issue.severity.toUpperCase()}] ${issue.file}:${issue.line}`)
        console.log(`  Category: ${issue.category}`)
        console.log(`  ${issue.description}`)
        console.log(`  Suggestion: ${issue.suggestion}`)
      }
    }
  } catch {
    console.log('\nRaw output:', result.output)
  }

  console.log('\n--- Execution Stats ---')
  console.log('Total frames:', result.frames)
  console.log('Duration:', result.totalDuration, 'ms')
  console.log('MCP servers used:', result.mcpServers?.join(', ') || 'none')
}

main().catch(console.error)

// Export for use as a module
export default <CodeReviewAgent />

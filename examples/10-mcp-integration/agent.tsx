#!/usr/bin/env bun
import { Claude, executePlan } from '../../src'
import { filesystem, sqlite, github } from '../../src/mcp/presets'
import { create } from 'zustand'

/**
 * MCP Integration Example
 *
 * Demonstrates:
 * - Using MCP (Model Context Protocol) servers
 * - Built-in MCP presets (filesystem, sqlite, github)
 * - Extending Claude with external tool capabilities
 * - Tool scoping to specific agents
 */

interface MCPState {
  task: 'filesystem' | 'database' | 'github' | 'done'
  result: string
  setTask: (task: MCPState['task']) => void
  setResult: (result: string) => void
}

const useStore = create<MCPState>((set) => ({
  task: 'filesystem',
  result: '',
  setTask: (task) => set({ task }),
  setResult: (result) => set({ result }),
}))

function MCPIntegration({ demo }: { demo: string }) {
  const { task, setTask, setResult } = useStore()

  // Map demo type to task
  const taskMap: Record<string, MCPState['task']> = {
    filesystem: 'filesystem',
    fs: 'filesystem',
    database: 'database',
    db: 'database',
    github: 'github',
    gh: 'github',
  }

  const selectedTask = taskMap[demo] || 'filesystem'

  // Set initial task if needed
  if (task === 'filesystem' && selectedTask !== 'filesystem') {
    setTask(selectedTask)
  }

  if (task === 'filesystem') {
    return (
      <Claude
        mcpServers={[
          filesystem({
            allowedDirectories: ['./examples', './src', './docs'],
          }),
        ]}
        onFinished={(result) => {
          setResult(result.text)
          setTask('done')
        }}
      >
        Demonstrate filesystem MCP server capabilities:

        1. List files in ./examples directory
        2. Read README.md from one of the example directories
        3. Search for files containing "Claude" keyword
        4. Get file info (size, modified date) for package.json

        Use the MCP filesystem tools to accomplish these tasks.

        Report what you found in a clear summary.
      </Claude>
    )
  }

  if (task === 'database') {
    return (
      <Claude
        mcpServers={[
          sqlite({
            databases: {
              demo: ':memory:', // In-memory database for demo
            },
          }),
        ]}
        onFinished={(result) => {
          setResult(result.text)
          setTask('done')
        }}
      >
        Demonstrate SQLite MCP server capabilities:

        1. Create a table: CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)
        2. Insert sample data (3-5 users)
        3. Query all users: SELECT * FROM users
        4. Query with condition: SELECT * FROM users WHERE email LIKE '%@example.com'
        5. Show table schema: PRAGMA table_info(users)

        Use the MCP SQLite tools to execute these SQL commands.

        Report the results of each operation.
      </Claude>
    )
  }

  if (task === 'github') {
    // Note: GitHub MCP requires GITHUB_TOKEN environment variable
    const hasToken = process.env.GITHUB_TOKEN

    if (!hasToken) {
      console.warn('⚠️  GITHUB_TOKEN not set - using mock mode for GitHub operations')
    }

    return (
      <Claude
        mcpServers={
          hasToken
            ? [
                github({
                  owner: 'evmts',
                  repo: 'smithers',
                }),
              ]
            : []
        }
        onFinished={(result) => {
          setResult(result.text)
          setTask('done')
        }}
      >
        {hasToken
          ? `Demonstrate GitHub MCP server capabilities:

1. Get repository information (stars, forks, description)
2. List recent issues (last 5)
3. Search for pull requests with label "enhancement"
4. Get commit history (last 10 commits)

Use the MCP GitHub tools to access this data.

Report a summary of what you found.`
          : `GitHub MCP server requires GITHUB_TOKEN environment variable.

Instead, explain:
1. What the GitHub MCP server provides
2. What operations it can perform
3. How to set it up (GITHUB_TOKEN, owner, repo)
4. Example use cases`}
      </Claude>
    )
  }

  // Done
  return null
}

// Main execution
const demo = process.argv[2] || 'filesystem'
const validDemos = ['filesystem', 'fs', 'database', 'db', 'github', 'gh']

if (!validDemos.includes(demo)) {
  console.error(`❌ Invalid demo: ${demo}`)
  console.error(`   Valid demos: filesystem, database, github`)
  process.exit(1)
}

console.log('🔌 MCP Integration Demo')
console.log(`  Type: ${demo}`)
console.log()

// Check for GitHub token if needed
if ((demo === 'github' || demo === 'gh') && !process.env.GITHUB_TOKEN) {
  console.warn('⚠️  GITHUB_TOKEN not set')
  console.warn('   Set it with: export GITHUB_TOKEN=ghp_...')
  console.warn('   Continuing in explanation mode...')
  console.log()
}

const result = await executePlan(<MCPIntegration demo={demo} />, {
  mockMode: process.env.SMITHERS_MOCK === 'true',
})

const { result: output } = useStore.getState()

console.log()
console.log('✅ MCP Demo Complete')
console.log()

if (output) {
  console.log('Result:')
  console.log(output)
}

#!/usr/bin/env bun
import { Claude, executePlan } from '../../src'
import { create } from 'zustand'

/**
 * Git Helper Example
 *
 * Demonstrates:
 * - Running git commands via Bash tool
 * - Interactive command-line workflows
 * - Error handling for git operations
 * - Structured git information extraction
 */

interface GitHelperState {
  command: 'status' | 'commit' | 'branch' | 'log' | 'diff' | 'done'
  result: string | null
  setCommand: (command: GitHelperState['command']) => void
  setResult: (result: string) => void
}

const useStore = create<GitHelperState>((set) => ({
  command: 'status',
  result: null,
  setCommand: (command) => set({ command }),
  setResult: (result) => set({ result }),
}))

function GitHelper({ operation, ...args }: { operation: string; [key: string]: any }) {
  const { command, setCommand, setResult } = useStore()

  // Map user operation to internal command
  const commandMap: Record<string, GitHelperState['command']> = {
    status: 'status',
    commit: 'commit',
    branch: 'branch',
    log: 'log',
    diff: 'diff',
  }

  const targetCommand = commandMap[operation] || 'status'

  // Set initial command if needed
  if (command === 'status' && targetCommand !== 'status') {
    setCommand(targetCommand)
  }

  if (command === 'status') {
    return (
      <Claude
        allowedTools={['Bash']}
        onFinished={(result) => {
          setResult(result.text)
          setCommand('done')
        }}
      >
        Run `git status` and provide a summary of:
        - Modified files
        - Untracked files
        - Branch information
        - Whether there are changes to commit

        Format the output in a clear, readable way.
      </Claude>
    )
  }

  if (command === 'commit') {
    const message = args.message || 'Update files'

    return (
      <Claude
        allowedTools={['Bash']}
        onFinished={(result) => {
          setResult(result.text)
          setCommand('done')
        }}
      >
        Create a git commit with the following:

        1. Stage all changed files with `git add -A`
        2. Create commit with message: {message}
        3. Show the commit hash and summary

        If there are no changes to commit, report that clearly.
      </Claude>
    )
  }

  if (command === 'branch') {
    const newBranch = args.branch

    if (newBranch) {
      return (
        <Claude
          allowedTools={['Bash']}
          onFinished={(result) => {
            setResult(result.text)
            setCommand('done')
          }}
        >
          Create and switch to a new git branch: {newBranch}

          1. Check if branch already exists
          2. Create branch with `git checkout -b {newBranch}`
          3. Confirm the switch was successful

          Report any errors clearly.
        </Claude>
      )
    }

    return (
      <Claude
        allowedTools={['Bash']}
        onFinished={(result) => {
          setResult(result.text)
          setCommand('done')
        }}
      >
        List all git branches and highlight the current branch.

        Use `git branch -a` to show all branches including remotes.
        Format the output clearly.
      </Claude>
    )
  }

  if (command === 'log') {
    const count = args.count || 5

    return (
      <Claude
        allowedTools={['Bash']}
        onFinished={(result) => {
          setResult(result.text)
          setCommand('done')
        }}
      >
        Show the last {count} git commits with:
        - Commit hash (short)
        - Author
        - Date (relative, like "2 days ago")
        - Commit message

        Use `git log --oneline --format='%h | %an | %ar | %s' -n {count}`

        Format as a nice table.
      </Claude>
    )
  }

  if (command === 'diff') {
    const file = args.file

    return (
      <Claude
        allowedTools={['Bash']}
        onFinished={(result) => {
          setResult(result.text)
          setCommand('done')
        }}
      >
        Show git diff for {file ? `file: ${file}` : 'all changed files'}.

        {file ? `Use: git diff ${file}` : 'Use: git diff'}

        Provide a summary of:
        - Files changed
        - Lines added/removed
        - Key changes

        Format the output clearly.
      </Claude>
    )
  }

  // Done - return null
  return null
}

// Main execution
const operation = process.argv[2] || 'status'
const validOps = ['status', 'commit', 'branch', 'log', 'diff']

if (!validOps.includes(operation)) {
  console.error(`❌ Invalid operation: ${operation}`)
  console.error(`   Valid operations: ${validOps.join(', ')}`)
  process.exit(1)
}

// Parse additional arguments based on operation
const args: Record<string, any> = {}

if (operation === 'commit') {
  args.message = process.argv[3] || 'Update files'
}

if (operation === 'branch') {
  args.branch = process.argv[3]
}

if (operation === 'log') {
  args.count = parseInt(process.argv[3] || '5', 10)
}

if (operation === 'diff') {
  args.file = process.argv[3]
}

console.log(`🔧 Git Helper - ${operation}`)
console.log()

const result = await executePlan(<GitHelper operation={operation} {...args} />, {
  mockMode: process.env.SMITHERS_MOCK === 'true',
})

console.log()
console.log('✅ Git operation complete')

if (useStore.getState().result) {
  console.log()
  console.log(useStore.getState().result)
}

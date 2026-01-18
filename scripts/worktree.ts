#!/usr/bin/env bun
/**
 * Worktree Manager - Deploy agents to execute worktree tasks
 *
 * Usage:
 *   bun scripts/worktree.ts --name <worktree>           # Deploy agent to specific worktree
 *   bun scripts/worktree.ts --create "<prompt>"         # Create new worktree from prompt
 *   bun scripts/worktree.ts --all                       # Launch master agent for all worktrees
 *   bun scripts/worktree.ts --agent codex --thinking xhigh  # Configure agent settings
 */

import { Glob } from 'bun'

// ============================================================================
// Configuration
// ============================================================================

interface WorktreeConfig {
  name?: string
  create?: string
  all: boolean
  agent: string
  thinking: string
  yolo: boolean
  cwd: string
}

/**
 * Parse command line arguments
 */
function parseConfig(): WorktreeConfig {
  const args = process.argv.slice(2)
  const config: WorktreeConfig = {
    all: false,
    agent: process.env['WORKTREE_AGENT'] ?? 'codex',
    thinking: process.env['WORKTREE_THINKING'] ?? 'xhigh',
    yolo: process.env['WORKTREE_YOLO'] === 'true' || true, // Default to true
    cwd: process.cwd(),
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--name':
        config.name = args[++i]
        break
      case '--create':
        config.create = args[++i]
        break
      case '--all':
        config.all = true
        break
      case '--agent':
        config.agent = args[++i] ?? 'codex'
        break
      case '--thinking':
        config.thinking = args[++i] ?? 'xhigh'
        break
      case '--no-yolo':
        config.yolo = false
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
    }
  }

  return config
}

function printHelp(): void {
  console.log(`
Worktree Manager - Deploy agents to execute worktree tasks

Usage:
  bun scripts/worktree.ts [options]

Options:
  --name <name>       Deploy agent to specific worktree
  --create "<prompt>" Create new worktree with prompt
  --all              Launch master agent to monitor all worktrees
  --agent <name>     Agent to use (default: codex)
  --thinking <level> Thinking level: low, medium, high, xhigh (default: xhigh)
  --no-yolo          Disable --yolo mode (default: enabled)
  -h, --help         Show this help

Environment Variables:
  WORKTREE_AGENT     Default agent (default: codex)
  WORKTREE_THINKING  Default thinking level (default: xhigh)
  WORKTREE_YOLO      Enable yolo mode (default: true)

Examples:
  bun scripts/worktree.ts --name chat-transport
  bun scripts/worktree.ts --create "Add rate limiting to API endpoints"
  bun scripts/worktree.ts --all
  bun scripts/worktree.ts --name streaming-protocol --agent opus --thinking medium
`)
}

// ============================================================================
// Worktree Operations
// ============================================================================

/**
 * List all existing worktrees
 */
async function listWorktrees(cwd: string): Promise<string[]> {
  const worktreesDir = `${cwd}/.worktrees`

  // Check if .worktrees directory exists
  try {
    const result = await Bun.$`test -d ${worktreesDir}`.cwd(cwd).quiet()
    if (result.exitCode !== 0) return []
  } catch {
    return []
  }

  // List directories in .worktrees
  const result = await Bun.$`ls -1 ${worktreesDir}`.cwd(cwd).quiet()
  if (result.exitCode !== 0) return []

  const entries = result.stdout.toString().trim().split('\n').filter(Boolean)
  const worktrees: string[] = []

  // Filter for directories only
  for (const entry of entries) {
    const checkDir = await Bun.$`test -d ${worktreesDir}/${entry}`.cwd(cwd).quiet()
    if (checkDir.exitCode === 0) {
      worktrees.push(entry)
    }
  }

  return worktrees.sort()
}

/**
 * Create a new worktree from a prompt
 */
async function createWorktree(cwd: string, prompt: string): Promise<string> {
  // Generate worktree name from prompt (kebab-case)
  const name = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50)

  const worktreePath = `${cwd}/.worktrees/${name}`
  const branchName = `issue/${name}`

  console.log(`Creating worktree: ${name}`)
  console.log(`Branch: ${branchName}`)

  // Create worktree directory
  await Bun.$`mkdir -p .worktrees`.cwd(cwd).quiet()

  // Create git worktree
  const result = await Bun.$`git worktree add ${worktreePath} -b ${branchName}`.cwd(cwd).quiet()

  if (result.exitCode !== 0) {
    throw new Error(`Failed to create worktree: ${result.stderr.toString()}`)
  }

  // Create PROMPT.md
  const promptMd = `# Issue: ${prompt}

## Task

${prompt}

## Workflow

1. Make commits as you implement
2. When ready, push and create PR:
   \`\`\`bash
   git push -u origin ${branchName}
   gh pr create --title "${prompt}" --body "Implements ${name}"
   \`\`\`
`

  await Bun.write(`${worktreePath}/PROMPT.md`, promptMd)

  // Also create an issue file
  const issueFile = `${cwd}/issues/${name}.md`
  const issueMd = `# ${prompt}

**Status:** In Progress

## Description

${prompt}

## Implementation Notes

(To be filled in during implementation)
`

  await Bun.write(issueFile, issueMd)

  console.log(`✓ Worktree created: .worktrees/${name}`)
  console.log(`✓ Issue created: issues/${name}.md`)

  return name
}

/**
 * Deploy agent to a specific worktree
 */
async function deployToWorktree(
  config: WorktreeConfig,
  worktreeName: string
): Promise<{ success: boolean; output: string }> {
  const worktreePath = `${config.cwd}/.worktrees/${worktreeName}`
  const promptFile = `${worktreePath}/PROMPT.md`

  // Check if worktree exists
  const exists = await Bun.file(worktreePath).exists()
  if (!exists) {
    throw new Error(`Worktree not found: ${worktreeName}`)
  }

  // Read PROMPT.md
  const promptContent = await Bun.file(promptFile).text()

  // Build Claude CLI command
  const args = ['claude', '--print']

  // Add agent/model
  if (config.agent) {
    args.push('--model', config.agent)
  }

  // Add thinking level
  if (config.thinking) {
    args.push('--thinking', config.thinking)
  }

  // Add yolo mode
  if (config.yolo) {
    args.push('--yolo')
  }

  // Add the prompt
  const prompt = `You are working in the worktree: ${worktreeName}

${promptContent}

---

**Instructions:**
1. Read PROMPT.md for full context
2. Follow CLAUDE.md conventions (Bun, vendored hooks, no useState, etc.)
3. Commit changes with git notes per CLAUDE.md protocol
4. When complete, push and create PR as described in PROMPT.md
5. Run tests: \`bun test\`
6. Ensure build passes: \`bun run check\`

Current working directory: ${worktreePath}
`

  args.push(prompt)

  console.log(`\n${'='.repeat(70)}`)
  console.log(`Deploying to worktree: ${worktreeName}`)
  console.log(`Agent: ${config.agent} | Thinking: ${config.thinking} | Yolo: ${config.yolo}`)
  console.log(`${'='.repeat(70)}\n`)

  // Execute Claude CLI in the worktree directory
  const proc = Bun.spawn(args, {
    cwd: worktreePath,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env },
  })

  let output = ''

  // Stream stdout
  const stdoutReader = proc.stdout.getReader()
  const decoder = new TextDecoder()

  try {
    while (true) {
      const { done, value } = await stdoutReader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      output += chunk
      process.stdout.write(chunk)
    }
  } catch (e) {
    // Reader closed
  }

  // Also capture stderr
  const stderrText = await new Response(proc.stderr).text()
  if (stderrText) {
    console.error(stderrText)
    output += '\n' + stderrText
  }

  const exitCode = await proc.exited
  return {
    success: exitCode === 0,
    output,
  }
}

/**
 * Deploy master agent to monitor all worktrees
 */
async function deployMasterAgent(config: WorktreeConfig): Promise<void> {
  const worktrees = await listWorktrees(config.cwd)

  if (worktrees.length === 0) {
    console.log('No worktrees found in .worktrees/')
    return
  }

  console.log(`Found ${worktrees.length} worktrees:\n`)
  for (const wt of worktrees) {
    console.log(`  - ${wt}`)
  }
  console.log()

  // Build master agent prompt
  const prompt = `You are the master orchestrator for ${worktrees.length} parallel worktrees.

**Worktrees to manage:**
${worktrees.map((wt) => `- .worktrees/${wt}`).join('\n')}

**Your Task:**

1. **Launch agents in parallel** - For each worktree, spawn a separate Claude agent:
   - Use the Task tool with subagent_type=general-purpose
   - Each agent should:
     * cd to the worktree directory
     * Read PROMPT.md for context
     * Implement the solution
     * Commit changes following CLAUDE.md protocol
     * Run tests and checks
     * Push and create PR when complete
   - Launch ALL agents in a single message with multiple Task tool calls

2. **Monitor progress** - Every 5 minutes:
   - Check git status in each worktree
   - Check if PRs have been created (gh pr list)
   - Report progress summary:
     * Completed (PR created): [list]
     * In progress (commits made): [list]
     * Not started: [list]
     * Failed/blocked: [list with errors]

3. **Loop until complete** - Continue monitoring until:
   - All worktrees have PRs created OR
   - All agents are blocked/failed
   - User interrupts (Ctrl+C)

**Agent Configuration:**
- Default: ${config.agent} with ${config.thinking} thinking in ${config.yolo ? '--yolo' : 'normal'} mode
- Each spawned agent should use these settings

**Reporting Format:**
\`\`\`
═══════════════════════════════════════════════════════════
Worktree Status Report - $(date)
═══════════════════════════════════════════════════════════

✓ Completed (X/Y):
  - worktree-1 → PR #123
  - worktree-2 → PR #124

⚙ In Progress (X/Y):
  - worktree-3: 5 commits, tests passing
  - worktree-4: 2 commits, working on implementation

⏸ Not Started (X/Y):
  - worktree-5
  - worktree-6

✗ Blocked/Failed (X/Y):
  - worktree-7: Test failures in module X
  - worktree-8: Type errors in component Y

Next check in 5 minutes...
\`\`\`

**Important:**
- Run agents in PARALLEL (single message, multiple Task calls)
- Be patient - agents may take 10-30 minutes per worktree
- Provide clear, actionable error messages
- Follow CLAUDE.md conventions strictly
`

  // Build Claude CLI command for master agent
  const args = ['claude', '--print']

  if (config.agent) {
    args.push('--model', config.agent)
  }

  if (config.thinking) {
    args.push('--thinking', config.thinking)
  }

  if (config.yolo) {
    args.push('--yolo')
  }

  args.push(prompt)

  console.log(`\n${'='.repeat(70)}`)
  console.log(`Launching Master Orchestrator Agent`)
  console.log(`Managing ${worktrees.length} worktrees in parallel`)
  console.log(`Agent: ${config.agent} | Thinking: ${config.thinking} | Yolo: ${config.yolo}`)
  console.log(`${'='.repeat(70)}\n`)

  // Execute Claude CLI
  const proc = Bun.spawn(args, {
    cwd: config.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env },
  })

  // Stream output
  const stdoutReader = proc.stdout.getReader()
  const decoder = new TextDecoder()

  try {
    while (true) {
      const { done, value } = await stdoutReader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      process.stdout.write(chunk)
    }
  } catch (e) {
    // Reader closed
  }

  const stderrText = await new Response(proc.stderr).text()
  if (stderrText) {
    console.error(stderrText)
  }

  await proc.exited
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const config = parseConfig()

  // Handle --create
  if (config.create) {
    const name = await createWorktree(config.cwd, config.create)
    console.log(`\nWorktree created: ${name}`)
    console.log(`\nDeploy agent with: bun scripts/worktree.ts --name ${name}`)
    return
  }

  // Handle --all
  if (config.all) {
    await deployMasterAgent(config)
    return
  }

  // Handle --name
  if (config.name) {
    const result = await deployToWorktree(config, config.name)
    if (result.success) {
      console.log(`\n✓ Worktree agent completed: ${config.name}`)
    } else {
      console.log(`\n✗ Worktree agent failed: ${config.name}`)
      process.exit(1)
    }
    return
  }

  // No action specified - list worktrees
  const worktrees = await listWorktrees(config.cwd)
  if (worktrees.length === 0) {
    console.log('No worktrees found. Create one with --create "<prompt>"')
  } else {
    console.log(`\nAvailable worktrees (${worktrees.length}):\n`)
    for (const wt of worktrees) {
      console.log(`  - ${wt}`)
    }
    console.log('\nDeploy with: bun scripts/worktree.ts --name <worktree>')
    console.log('Monitor all: bun scripts/worktree.ts --all')
  }
}

// Run
main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})

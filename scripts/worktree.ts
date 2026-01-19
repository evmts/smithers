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
  iterations: number
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
    iterations: parseInt(process.env['WORKTREE_ITERATIONS'] ?? '3', 10),
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
      case '--iterations':
        config.iterations = parseInt(args[++i] ?? '3', 10)
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
  --iterations <n>   Number of times to run each agent (default: 3)
  --no-yolo          Disable --yolo mode (default: enabled)
  -h, --help         Show this help

Environment Variables:
  WORKTREE_AGENT      Default agent (default: codex)
  WORKTREE_THINKING   Default thinking level (default: xhigh)
  WORKTREE_ITERATIONS Number of iterations (default: 3)
  WORKTREE_YOLO       Enable yolo mode (default: true)

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
  const exists = await Bun.file(promptFile).exists()
  if (!exists) {
    throw new Error(`Worktree not found: ${worktreeName}`)
  }

  // Read PROMPT.md
  const promptContent = await Bun.file(promptFile).text()

  // Build CLI command - detect codex vs claude
  // OpenAI models: codex, o1, o1-mini, o1-preview, o3, o3-mini
  const isCodex = config.agent === 'codex' || config.agent.startsWith('o1') || config.agent.startsWith('o3')
  const args: string[] = []

  if (isCodex) {
    args.push('codex', 'exec')
    if (config.agent !== 'codex') {
      args.push('--model', config.agent)
    }
    if (config.yolo) {
      args.push('--dangerously-bypass-approvals-and-sandbox')
    } else {
      args.push('--full-auto')
    }
  } else {
    args.push('claude', '--print')
    if (config.agent) {
      args.push('--model', config.agent)
    }
    if (config.yolo) {
      args.push('--dangerously-skip-permissions')
    }
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
  // For Claude (non-codex): exclude ANTHROPIC_API_KEY to use subscription credits
  const env = isCodex
    ? { ...process.env }
    : Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ANTHROPIC_API_KEY'))

  const proc = Bun.spawn(args, {
    cwd: worktreePath,
    stdout: 'pipe',
    stderr: 'pipe',
    env,
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

  // For Claude: check if subscription failed and retry with API key
  if (!isCodex && exitCode !== 0 && process.env.ANTHROPIC_API_KEY) {
    const combined = `${output}\n${stderrText}`.toLowerCase()
    const isAuthFailure =
      combined.includes('subscription') ||
      combined.includes('billing') ||
      combined.includes('credits') ||
      combined.includes('quota') ||
      combined.includes('unauthorized') ||
      combined.includes('authentication') ||
      combined.includes('not logged in') ||
      combined.includes('login required')

    if (isAuthFailure) {
      console.log('\nSubscription auth failed, retrying with API key...\n')
      const retryProc = Bun.spawn(args, {
        cwd: worktreePath,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env }, // Include ANTHROPIC_API_KEY
      })

      let retryOutput = ''
      const retryReader = retryProc.stdout.getReader()
      try {
        while (true) {
          const { done, value } = await retryReader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          retryOutput += chunk
          process.stdout.write(chunk)
        }
      } catch {
        // Reader closed
      }

      const retryStderr = await new Response(retryProc.stderr).text()
      if (retryStderr) {
        console.error(retryStderr)
        retryOutput += '\n' + retryStderr
      }

      const retryExitCode = await retryProc.exited
      return { success: retryExitCode === 0, output: retryOutput }
    }
  }

  return {
    success: exitCode === 0,
    output,
  }
}

interface WorktreeResult {
  name: string
  success: boolean
  output: string
  hasPR: boolean
}

/**
 * Build prompt for a single worktree agent
 */
function buildWorktreePrompt(
  worktreeName: string,
  iteration: number,
  totalIterations: number
): string {
  return `You are working in worktree: ${worktreeName}
Iteration: ${iteration}/${totalIterations}

**FIRST: Review existing work**
- Check git log for existing commits: git log --oneline -10
- Read any implementation already done
- Check if tests pass: bun test
- Check if build passes: bun run check
- Check if PR exists: gh pr list --head issue/${worktreeName}

**IF work is incomplete:**
- Read PROMPT.md for requirements
- Continue implementation from where it left off
- Commit incrementally with good messages
- Follow CLAUDE.md conventions

**IF work appears complete (tests pass, PR exists):**
- Polish: improve code quality, naming, comments
- Add test coverage: find edge cases, add integration tests
- Update docs: ensure README and inline docs are accurate
- Look for any remaining TODOs or FIXMEs

**Always:**
- Follow CLAUDE.md conventions (Bun, vendored hooks, no useState)
- Commit changes with descriptive messages
- Push and create PR if not exists:
  git push -u origin issue/${worktreeName}
  gh pr create --title "Issue: ${worktreeName}" --body "See issues/${worktreeName}.md"

Report what you accomplished at the end.`
}

/**
 * Run a single agent for a worktree
 */
async function runWorktreeAgent(
  config: WorktreeConfig,
  worktreeName: string,
  iteration: number
): Promise<WorktreeResult> {
  const worktreePath = `${config.cwd}/.worktrees/${worktreeName}`
  const prompt = buildWorktreePrompt(worktreeName, iteration, config.iterations)

  // Build CLI command
  // OpenAI models: codex, o1, o1-mini, o1-preview, o3, o3-mini
  const isCodex = config.agent === 'codex' || config.agent.startsWith('o1') || config.agent.startsWith('o3')
  const args: string[] = []

  if (isCodex) {
    args.push('codex', 'exec')
    if (config.agent !== 'codex') {
      args.push('--model', config.agent)
    }
    if (config.yolo) {
      args.push('--dangerously-bypass-approvals-and-sandbox')
    } else {
      args.push('--full-auto')
    }
    args.push('-C', worktreePath)
  } else {
    args.push('claude', '--print')
    if (config.agent) {
      args.push('--model', config.agent)
    }
    if (config.yolo) {
      args.push('--dangerously-skip-permissions')
    }
  }

  args.push(prompt)

  console.log(`    [${worktreeName}] Starting...`)

  // For Claude (non-codex): exclude ANTHROPIC_API_KEY to use subscription credits
  const env = isCodex
    ? { ...process.env }
    : Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ANTHROPIC_API_KEY'))

  const proc = Bun.spawn(args, {
    cwd: isCodex ? config.cwd : worktreePath,
    stdout: 'pipe',
    stderr: 'pipe',
    env,
  })

  let output = ''
  const decoder = new TextDecoder()
  const stdoutReader = proc.stdout.getReader()

  try {
    while (true) {
      const { done, value } = await stdoutReader.read()
      if (done) break
      output += decoder.decode(value, { stream: true })
    }
  } catch {
    // Reader closed
  }

  const stderrText = await new Response(proc.stderr).text()
  if (stderrText) output += '\n' + stderrText

  let exitCode = await proc.exited

  // For Claude: check if subscription failed and retry with API key
  if (!isCodex && exitCode !== 0 && process.env.ANTHROPIC_API_KEY) {
    const combined = `${output}\n${stderrText}`.toLowerCase()
    const isAuthFailure =
      combined.includes('subscription') ||
      combined.includes('billing') ||
      combined.includes('credits') ||
      combined.includes('quota') ||
      combined.includes('unauthorized') ||
      combined.includes('authentication') ||
      combined.includes('not logged in') ||
      combined.includes('login required')

    if (isAuthFailure) {
      console.log(`    [${worktreeName}] Subscription auth failed, retrying with API key...`)
      const retryProc = Bun.spawn(args, {
        cwd: isCodex ? config.cwd : worktreePath,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env }, // Include ANTHROPIC_API_KEY
      })

      output = ''
      const retryReader = retryProc.stdout.getReader()
      try {
        while (true) {
          const { done, value } = await retryReader.read()
          if (done) break
          output += decoder.decode(value, { stream: true })
        }
      } catch {
        // Reader closed
      }

      const retryStderr = await new Response(retryProc.stderr).text()
      if (retryStderr) output += '\n' + retryStderr

      exitCode = await retryProc.exited
    }
  }

  // Check if PR exists
  let hasPR = false
  try {
    const prCheck = await Bun.$`gh pr list --head issue/${worktreeName} --json number`.cwd(config.cwd).quiet()
    hasPR = prCheck.stdout.toString().includes('"number"')
  } catch {
    // gh command failed, assume no PR
  }

  console.log(`    [${worktreeName}] Done (exit: ${exitCode}, PR: ${hasPR ? 'yes' : 'no'})`)

  return {
    name: worktreeName,
    success: exitCode === 0,
    output,
    hasPR,
  }
}

/**
 * Deploy agents to all worktrees in parallel with multiple iterations (ralphing)
 */
async function deployMasterAgent(config: WorktreeConfig): Promise<void> {
  const worktrees = await listWorktrees(config.cwd)

  if (worktrees.length === 0) {
    console.log('No worktrees found in .worktrees/')
    return
  }

  console.log(`\n${'='.repeat(70)}`)
  console.log(`Worktree Orchestrator - Ralphing Mode`)
  console.log(`${'='.repeat(70)}`)
  console.log(`\nWorktrees: ${worktrees.length}`)
  console.log(`Iterations: ${config.iterations}`)
  console.log(`Agent: ${config.agent} | Yolo: ${config.yolo}`)
  console.log(`\nWorktrees:`)
  for (const wt of worktrees) {
    console.log(`  - ${wt}`)
  }

  const completedPRs = new Set<string>()

  // Run iterations
  for (let iteration = 1; iteration <= config.iterations; iteration++) {
    console.log(`\n${'═'.repeat(70)}`)
    console.log(`ITERATION ${iteration}/${config.iterations}`)
    console.log(`${'═'.repeat(70)}`)

    // Filter out worktrees that already have PRs
    const pendingWorktrees = worktrees.filter((wt) => !completedPRs.has(wt))

    if (pendingWorktrees.length === 0) {
      console.log('\nAll worktrees have PRs created! Done.')
      break
    }

    console.log(`\nLaunching ${pendingWorktrees.length} agents in parallel...`)
    const startTime = Date.now()

    // Launch all agents in parallel
    const promises = pendingWorktrees.map((wt) => runWorktreeAgent(config, wt, iteration))

    // Wait for all to complete
    const results = await Promise.all(promises)
    const elapsed = Math.round((Date.now() - startTime) / 1000)

    // Report results
    console.log(`\n${'─'.repeat(70)}`)
    console.log(`Iteration ${iteration} Complete (${elapsed}s)`)
    console.log(`${'─'.repeat(70)}`)

    const newPRs: string[] = []
    const inProgress: string[] = []
    const failed: string[] = []

    for (const result of results) {
      if (result.hasPR) {
        completedPRs.add(result.name)
        newPRs.push(result.name)
      } else if (result.success) {
        inProgress.push(result.name)
      } else {
        failed.push(result.name)
      }
    }

    console.log(`\n✓ PRs Created (${completedPRs.size}/${worktrees.length}):`)
    if (newPRs.length > 0) {
      for (const name of newPRs) console.log(`  - ${name}`)
    } else {
      console.log('  (none this iteration)')
    }

    if (inProgress.length > 0) {
      console.log(`\n⚙ In Progress (${inProgress.length}):`)
      for (const name of inProgress) console.log(`  - ${name}`)
    }

    if (failed.length > 0) {
      console.log(`\n✗ Failed (${failed.length}):`)
      for (const name of failed) console.log(`  - ${name}`)
    }

    // Check if all done
    if (completedPRs.size === worktrees.length) {
      console.log('\nAll worktrees have PRs! Success!')
      break
    }

    // Sleep between iterations (except last)
    if (iteration < config.iterations) {
      console.log('\nSleeping 5 minutes before next iteration...')
      await Bun.sleep(5 * 60 * 1000)
    }
  }

  // Final summary
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`FINAL SUMMARY`)
  console.log(`${'═'.repeat(70)}`)
  console.log(`\nTotal PRs: ${completedPRs.size}/${worktrees.length}`)

  if (completedPRs.size > 0) {
    console.log('\nCompleted:')
    for (const name of completedPRs) console.log(`  ✓ ${name}`)
  }

  const remaining = worktrees.filter((wt) => !completedPRs.has(wt))
  if (remaining.length > 0) {
    console.log('\nRemaining:')
    for (const name of remaining) console.log(`  - ${name}`)
  }
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

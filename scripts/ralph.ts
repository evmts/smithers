#!/usr/bin/env bun
/**
 * Ralph - Autonomous Task Runner
 *
 * Runs Claude Code CLI in a loop, picking one issue from reviews/*.md or TODO.md
 * per iteration, completing it, then sleeping between iterations.
 *
 * Usage:
 *   bun src/ralph.ts                          # Default: 6 hours with opus
 *   bun src/ralph.ts --duration 15m --model sonnet  # Quick test
 *   bun src/ralph.ts --dry-run                # Preview tasks without executing
 */

import { Glob } from 'bun'

// ============================================================================
// Configuration
// ============================================================================

interface RalphConfig {
  durationMs: number
  sleepMs: number
  model: string
  dryRun: boolean
  maxTurns: number
  cwd: string
}

interface Task {
  title: string
  file: string
  priority: number
  content: string
  type: 'review' | 'todo'
}

const PRIORITY_MAP: Record<string, number> = {
  CRITICAL: 0,
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  'HIGH PRIORITY': 1,
  'MEDIUM PRIORITY': 2,
  'LOW PRIORITY': 3,
}

const MODEL_MAP: Record<string, string> = {
  opus: 'claude-opus-4-5-20251101',
  sonnet: 'claude-sonnet-4-20250514',
  haiku: 'claude-haiku-3-5-20241022',
}

/**
 * Parse duration string like "6h", "30m", "1h30m" to milliseconds
 */
function parseDuration(duration: string): number {
  let totalMs = 0
  const hourMatch = duration.match(/(\d+)h/)
  const minMatch = duration.match(/(\d+)m/)
  const secMatch = duration.match(/(\d+)s/)

  if (hourMatch?.[1]) totalMs += parseInt(hourMatch[1], 10) * 60 * 60 * 1000
  if (minMatch?.[1]) totalMs += parseInt(minMatch[1], 10) * 60 * 1000
  if (secMatch?.[1]) totalMs += parseInt(secMatch[1], 10) * 1000

  if (totalMs === 0) {
    // Try parsing as plain number (assume minutes)
    const num = parseInt(duration, 10)
    if (!isNaN(num)) totalMs = num * 60 * 1000
  }

  return totalMs
}

/**
 * Parse command line arguments and environment variables
 */
function parseConfig(): RalphConfig {
  const args = process.argv.slice(2)
  const config: RalphConfig = {
    durationMs: parseDuration(process.env['RALPH_DURATION'] ?? '6h'),
    sleepMs: parseDuration(process.env['RALPH_SLEEP'] ?? '5m'),
    model: process.env['RALPH_MODEL'] ?? 'opus',
    dryRun: false,
    maxTurns: parseInt(process.env['RALPH_MAX_TURNS'] ?? '50', 10),
    cwd: process.cwd(),
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--duration':
        config.durationMs = parseDuration(args[++i] ?? '6h')
        break
      case '--sleep':
        config.sleepMs = parseDuration(args[++i] ?? '5m')
        break
      case '--model':
        config.model = args[++i] ?? 'opus'
        break
      case '--dry-run':
        config.dryRun = true
        break
      case '--max-turns':
        config.maxTurns = parseInt(args[++i] ?? '50', 10)
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
Ralph - Autonomous Task Runner

Usage:
  bun scripts/ralph.ts [options]

Options:
  --duration <time>   Total runtime (default: 6h)
                      Formats: 6h, 30m, 1h30m, 90 (minutes)
  --sleep <time>      Sleep between iterations (default: 5m)
  --model <model>     Claude model: opus, sonnet, haiku (default: opus)
  --max-turns <n>     Max turns per Claude invocation (default: 50)
  --dry-run           Show discovered tasks without executing
  -h, --help          Show this help

Environment Variables:
  RALPH_DURATION      Same as --duration
  RALPH_SLEEP         Same as --sleep
  RALPH_MODEL         Same as --model
  RALPH_MAX_TURNS     Same as --max-turns

Examples:
  bun src/ralph.ts                              # 6 hours with opus
  bun src/ralph.ts --duration 15m               # Quick 15 minute run
  bun src/ralph.ts --dry-run                    # Preview tasks
  RALPH_DURATION=12h bun src/ralph.ts           # 12 hour overnight run
`)
}

// ============================================================================
// Task Discovery
// ============================================================================

/**
 * Extract priority from file content
 */
function extractPriority(content: string): number {
  // Look for Priority: P0, P1, P2, P3
  const priorityMatch = content.match(
    /(?:Priority|Status|Severity)[:\s]*\*{0,2}(P[0-3]|HIGH|MEDIUM|LOW|CRITICAL)(?:\s+PRIORITY)?\*{0,2}/i
  )
  if (priorityMatch?.[1]) {
    const key = priorityMatch[1].toUpperCase()
    return PRIORITY_MAP[key] ?? 2
  }
  return 2 // Default to medium priority
}

/**
 * Extract title from markdown file (first heading)
 */
function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim() ?? 'Untitled Task'
}

/**
 * Discover tasks from reviews/*.md files
 */
async function discoverReviewTasks(cwd: string): Promise<Task[]> {
  const tasks: Task[] = []
  const glob = new Glob('reviews/*.md')

  for await (const file of glob.scan({ cwd, absolute: true })) {
    // Skip meta files
    if (file.endsWith('test-summary.md')) continue

    const content = await Bun.file(file).text()
    const title = extractTitle(content)
    const priority = extractPriority(content)

    tasks.push({
      title,
      file,
      priority,
      content,
      type: 'review',
    })
  }

  return tasks
}

/**
 * Parse unchecked TODO items from TODO.md
 */
async function discoverTodoTasks(cwd: string): Promise<Task[]> {
  const todoPath = `${cwd}/TODO.md`
  const file = Bun.file(todoPath)

  if (!(await file.exists())) return []

  const content = await file.text()
  const tasks: Task[] = []

  // Track current section for priority
  let currentPriority = 2
  const lines = content.split('\n')

  for (const line of lines) {
    // Check for section headers to determine priority
    if (line.startsWith('## ')) {
      if (line.includes('High') || line.includes('HIGH')) currentPriority = 1
      else if (line.includes('Medium') || line.includes('MEDIUM')) currentPriority = 2
      else if (line.includes('Low') || line.includes('LOW')) currentPriority = 3
    }

    // Match unchecked items: - [ ] **`file`** - description
    const itemMatch = line.match(/^- \[ \] \*{0,2}`?([^`*]+)`?\*{0,2}\s*(?:\([^)]+\))?\s*-?\s*(.*)$/)
    if (itemMatch) {
      const location = itemMatch[1] ?? 'unknown'
      const description = itemMatch[2] ?? ''
      tasks.push({
        title: description || location,
        file: todoPath,
        priority: currentPriority,
        content: `Location: ${location}\n\nTask: ${description || 'See location'}`,
        type: 'todo',
      })
    }
  }

  return tasks
}

/**
 * Discover all tasks and sort by priority
 */
async function discoverTasks(cwd: string): Promise<Task[]> {
  const reviewTasks = await discoverReviewTasks(cwd)
  const todoTasks = await discoverTodoTasks(cwd)

  // Prefer review tasks, fall back to TODO items
  const allTasks = reviewTasks.length > 0 ? reviewTasks : todoTasks

  // Sort by priority (lower number = higher priority)
  return allTasks.sort((a, b) => a.priority - b.priority)
}

// ============================================================================
// Claude Invocation
// ============================================================================

/**
 * Build the prompt for Claude
 */
function buildPrompt(task: Task): string {
  const priorityLabel = ['P0 - Critical', 'P1 - High', 'P2 - Medium', 'P3 - Low'][task.priority] || 'P2 - Medium'

  return `You are working on the Smithers codebase. Complete ONE task:

**Task:** ${task.title}
**Source:** ${task.file}
**Priority:** ${priorityLabel}

---

${task.content}

---

Instructions:
1. Focus on this ONE task only
2. Follow CLAUDE.md conventions (use Bun, vendored hooks from src/reconciler/hooks, etc.)
3. Commit changes with git note per CLAUDE.md protocol
4. ${task.type === 'review' ? `Delete the file ${task.file} when the issue is fixed` : `Check off the TODO item in ${task.file} when done`}
5. Run tests if applicable: \`bun test\`

If the task is already complete or nothing needs to be done, verify the fix and clean up the tracking file.
`
}

/**
 * Execute Claude CLI with streaming output
 */
async function executeClaude(
  config: RalphConfig,
  task: Task
): Promise<{ success: boolean; output: string }> {
  const prompt = buildPrompt(task)
  const modelId = MODEL_MAP[config.model] || config.model

  const args = [
    'claude',
    '--print',
    '--model',
    modelId,
    '--dangerously-skip-permissions',
    '--max-turns',
    String(config.maxTurns),
    prompt,
  ]

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Executing: claude --model ${config.model} --max-turns ${config.maxTurns}`)
  console.log(`${'='.repeat(60)}\n`)

  const proc = Bun.spawn(args, {
    cwd: config.cwd,
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
  } catch {
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

// ============================================================================
// Main Loop
// ============================================================================

interface RunStats {
  startTime: number
  iterations: number
  tasksCompleted: string[]
  tasksFailed: string[]
}

let shuttingDown = false

async function main(): Promise<void> {
  const config = parseConfig()
  const stats: RunStats = {
    startTime: Date.now(),
    iterations: 0,
    tasksCompleted: [],
    tasksFailed: [],
  }

  const endTime = stats.startTime + config.durationMs

  console.log(`
╔════════════════════════════════════════════════════════════╗
║  Ralph - Autonomous Task Runner                            ║
╠════════════════════════════════════════════════════════════╣
║  Duration: ${formatDuration(config.durationMs).padEnd(46)}║
║  Sleep:    ${formatDuration(config.sleepMs).padEnd(46)}║
║  Model:    ${config.model.padEnd(46)}║
║  Max Turns: ${String(config.maxTurns).padEnd(45)}║
║  Dry Run:  ${String(config.dryRun).padEnd(46)}║
╚════════════════════════════════════════════════════════════╝
`)

  // Discover tasks
  const tasks = await discoverTasks(config.cwd)

  if (tasks.length === 0) {
    console.log('No tasks discovered. Nothing to do!')
    return
  }

  console.log(`\nDiscovered ${tasks.length} tasks:\n`)
  for (const task of tasks) {
    const priorityLabel = ['P0', 'P1', 'P2', 'P3'][task.priority] || 'P2'
    console.log(`  [${priorityLabel}] ${task.title}`)
    console.log(`       ${task.file}\n`)
  }

  if (config.dryRun) {
    console.log('Dry run mode - not executing tasks.')
    return
  }

  // Setup graceful shutdown
  let forceKill = false
  const shutdown = () => {
    if (shuttingDown) {
      if (forceKill) {
        console.log('\nForce killing...')
        process.exit(1)
      }
      console.log('\nPress Ctrl+C again to force kill')
      forceKill = true
      return
    }
    shuttingDown = true
    console.log('\nGraceful shutdown requested. Completing current task...')
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Track completed task files to avoid re-running
  const completedFiles = new Set<string>()

  // Main loop
  while (Date.now() < endTime && !shuttingDown) {
    stats.iterations++

    // Find next task (skip completed ones)
    const task = tasks.find((t) => !completedFiles.has(t.file))

    if (!task) {
      console.log('\nAll discovered tasks completed!')
      // Re-discover tasks in case new ones were created
      const newTasks = await discoverTasks(config.cwd)
      if (newTasks.length === 0) {
        console.log('No new tasks found. Creating docs check task...')
        // Create a synthetic docs check task
        const docsTask: Task = {
          title: 'Verify documentation is up to date',
          file: 'docs-check',
          priority: 3,
          content: `Check that documentation in docs/ and README.md reflects the current implementation.
Look for any outdated information, missing features, or incorrect examples.
Make small improvements if needed.`,
          type: 'review',
        }
        tasks.push(docsTask)
      } else {
        // Add new tasks
        for (const t of newTasks) {
          if (!tasks.some((existing) => existing.file === t.file)) {
            tasks.push(t)
          }
        }
        tasks.sort((a, b) => a.priority - b.priority)
      }
      continue
    }

    console.log(`\n${'━'.repeat(60)}`)
    console.log(`Iteration ${stats.iterations}`)
    console.log(`Time remaining: ${formatDuration(endTime - Date.now())}`)
    console.log(`${'━'.repeat(60)}`)
    console.log(`\nTask: ${task.title}`)
    console.log(`File: ${task.file}`)
    console.log(`Priority: ${['P0', 'P1', 'P2', 'P3'][task.priority]}`)

    const result = await executeClaude(config, task)

    completedFiles.add(task.file)

    if (result.success) {
      stats.tasksCompleted.push(task.title)
      console.log(`\n✓ Task completed: ${task.title}`)
    } else {
      stats.tasksFailed.push(task.title)
      console.log(`\n✗ Task failed: ${task.title}`)
    }

    // Sleep if there's time remaining
    const timeRemaining = endTime - Date.now()
    if (timeRemaining > config.sleepMs && !shuttingDown) {
      console.log(`\nSleeping for ${formatDuration(config.sleepMs)}...`)
      await Bun.sleep(config.sleepMs)
    }
  }

  // Print summary
  printSummary(stats)
}

function formatDuration(ms: number): string {
  if (ms < 0) return '0s'
  const hours = Math.floor(ms / (60 * 60 * 1000))
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))
  const seconds = Math.floor((ms % (60 * 1000)) / 1000)

  const parts = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)
  return parts.join(' ')
}

function printSummary(stats: RunStats): void {
  const totalTime = Date.now() - stats.startTime

  console.log(`
╔════════════════════════════════════════════════════════════╗
║  Ralph Summary                                             ║
╠════════════════════════════════════════════════════════════╣
║  Total runtime:      ${formatDuration(totalTime).padEnd(36)}║
║  Iterations:         ${String(stats.iterations).padEnd(36)}║
║  Tasks completed:    ${String(stats.tasksCompleted.length).padEnd(36)}║
║  Tasks failed:       ${String(stats.tasksFailed.length).padEnd(36)}║
╚════════════════════════════════════════════════════════════╝
`)

  if (stats.tasksCompleted.length > 0) {
    console.log('Completed tasks:')
    for (const task of stats.tasksCompleted) {
      console.log(`  ✓ ${task}`)
    }
  }

  if (stats.tasksFailed.length > 0) {
    console.log('\nFailed tasks:')
    for (const task of stats.tasksFailed) {
      console.log(`  ✗ ${task}`)
    }
  }
}

// Run
main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})

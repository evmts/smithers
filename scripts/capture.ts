#!/usr/bin/env bun
/**
 * Capture Command - Classify and save conversation content
 *
 * Usage:
 *   bun scripts/capture.ts "Text to capture"
 *   bun scripts/capture.ts --stdin < file.txt
 *   bun scripts/capture.ts --type review --commit abc1234 "Content"
 *
 * Options:
 *   --type <review|issue|todo|prompt>  Force target type
 *   --commit <hash>                    Associate with commit (for reviews)
 *   --priority <high|medium|low>       Set priority (for TODO)
 *   --title <title>                    Override title (for issues)
 *   --stdin                            Read content from stdin
 *   --dry-run                          Preview without writing
 *   -h, --help                         Show help
 */

import {
  capture,
  classifyContent,
  writeCapture,
  type CaptureType,
  type CaptureContext,
} from '../src/utils/capture.js'

// ============================================================================
// Configuration
// ============================================================================

interface CaptureConfig {
  content: string
  type?: CaptureType
  commitHash?: string
  commitMessage?: string
  priority?: 'high' | 'medium' | 'low'
  title?: string
  stdin: boolean
  dryRun: boolean
  cwd: string
}

// ============================================================================
// Argument Parsing
// ============================================================================

function printHelp(): void {
  console.log(`
Capture Command - Classify and save conversation content

Usage:
  bun scripts/capture.ts "Text to capture"
  bun scripts/capture.ts --stdin < file.txt
  bun scripts/capture.ts --type review --commit abc1234 "Content"

Options:
  --type <review|issue|todo|prompt>  Force target type
  --commit <hash>                    Associate with commit (for reviews)
  --priority <high|medium|low>       Set priority (for TODO)
  --title <title>                    Override title (for issues)
  --stdin                            Read content from stdin
  --dry-run                          Preview without writing
  -h, --help                         Show help

Targets:
  reviews/  - Code reviews of commits/changes
  issues/   - Planned future features
  TODO.md   - Immediate action items
  Prompt.md - Explicit prompts (when requested)

Classification:
  Content is automatically classified based on:
  - Commit hashes + bug/issue language → review
  - Feature/implement language + no commits → issue
  - Urgent/checkbox patterns → todo
  - Explicit "put in Prompt.md" → prompt

Examples:
  # Auto-classify based on content
  bun scripts/capture.ts "Commit abc1234 has a bug in auth.ts:45"

  # Force type
  bun scripts/capture.ts --type issue "Add WebSocket support"

  # From stdin
  echo "Must fix tests" | bun scripts/capture.ts --stdin

  # With metadata
  bun scripts/capture.ts --type review --commit abc1234 "Review content"
`)
}

function parseArgs(): CaptureConfig {
  const args = process.argv.slice(2)
  const config: CaptureConfig = {
    content: '',
    stdin: false,
    dryRun: false,
    cwd: process.cwd(),
  }

  const positional: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!

    switch (arg) {
      case '--type':
        config.type = args[++i] as CaptureType
        if (!['review', 'issue', 'todo', 'prompt'].includes(config.type!)) {
          console.error(`Invalid type: ${config.type}. Must be review|issue|todo|prompt`)
          process.exit(1)
        }
        break
      case '--commit':
        config.commitHash = args[++i]
        break
      case '--priority':
        config.priority = args[++i] as 'high' | 'medium' | 'low'
        if (!['high', 'medium', 'low'].includes(config.priority!)) {
          console.error(`Invalid priority: ${config.priority}. Must be high|medium|low`)
          process.exit(1)
        }
        break
      case '--title':
        config.title = args[++i]
        break
      case '--stdin':
        config.stdin = true
        break
      case '--dry-run':
        config.dryRun = true
        break
      case '-h':
      case '--help':
        printHelp()
        process.exit(0)
      default:
        // Check if it looks like a flag (starts with -- or single -)
        if (arg.startsWith('--') || (arg.startsWith('-') && arg.length === 2)) {
          // Unknown flag, skip
        } else {
          // Content (even if starts with - like checkbox items)
          positional.push(arg)
        }
    }
  }

  config.content = positional.join(' ')
  return config
}

// ============================================================================
// Git Context
// ============================================================================

async function getCommitMessage(hash: string, cwd: string): Promise<string | undefined> {
  try {
    const result = await Bun.$`git log -1 --format=%s ${hash}`.cwd(cwd).quiet()
    if (result.exitCode === 0) {
      return result.stdout.toString().trim()
    }
  } catch {
    // Ignore errors
  }
  return undefined
}

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const result = await Bun.$`git rev-parse --is-inside-work-tree`.cwd(cwd).quiet()
    return result.exitCode === 0
  } catch {
    return false
  }
}

// ============================================================================
// Output Formatting
// ============================================================================

function formatConfidence(confidence: number): string {
  const pct = Math.round(confidence * 100)
  if (pct >= 80) return `${pct}%`
  if (pct >= 60) return `${pct}% (moderate)`
  return `${pct}% (low - consider using --type)`
}

function formatReasoning(reasoning: string[]): string {
  return reasoning.map((r) => `  - ${r}`).join('\n')
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const config = parseArgs()

  // Read from stdin if requested
  if (config.stdin) {
    const stdin = await Bun.stdin.text()
    config.content = config.content ? config.content + '\n' + stdin : stdin
  }

  if (!config.content.trim()) {
    console.error('Error: No content provided')
    console.error('Usage: bun scripts/capture.ts "Content to capture"')
    console.error('       bun scripts/capture.ts --stdin < file.txt')
    process.exit(1)
  }

  // Check git context
  const inGitRepo = await isGitRepo(config.cwd)
  if (!inGitRepo) {
    console.warn('Warning: Not in a git repository. Commit context unavailable.')
  }

  // Get commit message if hash provided
  if (config.commitHash && inGitRepo) {
    const msg = await getCommitMessage(config.commitHash, config.cwd)
    if (msg) {
      config.commitMessage = msg
    } else {
      console.warn(`Warning: Commit ${config.commitHash} not found in git history`)
    }
  }

  // Build context
  const ctx: CaptureContext = {
    content: config.content,
    commitHash: config.commitHash,
    commitMessage: config.commitMessage,
    priority: config.priority,
    title: config.title,
    cwd: config.cwd,
  }

  // Classify content
  const classification = classifyContent(ctx)

  // Override type if specified
  const finalType = config.type ?? classification.type

  // Generate capture
  const generated = await capture({
    ...ctx,
    // If type was overridden, we need to recapture with that type
  })

  // Apply type override to generated output if needed
  if (config.type && config.type !== generated.type) {
    // Re-capture with forced type by modifying content to trigger that classification
    generated.type = config.type
    generated.filePath = generated.filePath.replace(
      new RegExp(`(reviews|issues|TODO|Prompt)`),
      config.type === 'review'
        ? 'reviews'
        : config.type === 'issue'
          ? 'issues'
          : config.type === 'todo'
            ? 'TODO'
            : 'Prompt'
    )
  }

  // Output
  console.log()
  if (config.dryRun) {
    console.log('🔍 DRY RUN - No files will be written')
    console.log()
  }

  console.log(`✅ ${config.dryRun ? 'Would capture' : 'Captured'} to ${generated.filePath}`)
  console.log()
  console.log(`Classification: ${finalType} (confidence: ${formatConfidence(classification.confidence)})`)
  console.log('Reasoning:')
  console.log(formatReasoning(classification.reasoning.length ? classification.reasoning : ['Default classification']))
  console.log()

  // Preview
  console.log('Preview:')
  console.log('─'.repeat(60))
  const preview = generated.content.split('\n').slice(0, 15).join('\n')
  console.log(preview)
  if (generated.content.split('\n').length > 15) {
    console.log('...')
  }
  console.log('─'.repeat(60))
  console.log()

  // Write file
  if (!config.dryRun) {
    // Ensure directories exist
    const dir = generated.filePath.substring(0, generated.filePath.lastIndexOf('/'))
    await Bun.$`mkdir -p ${dir}`.quiet()

    await writeCapture(generated)
    console.log(`Full path: ${generated.filePath}`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message ?? err)
  process.exit(1)
})

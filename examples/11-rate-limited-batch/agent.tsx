#!/usr/bin/env bun
import { Claude, executePlan, ClaudeProvider, File } from '../../src'
import { create } from 'zustand'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

/**
 * Rate-Limited Batch Processing Example
 *
 * Demonstrates:
 * - Processing many items with ClaudeProvider rate limiting
 * - Usage tracking and budget enforcement
 * - Batch processing patterns
 * - Progress reporting
 */

interface BatchItem {
  id: string // Unique identifier (filename or line number)
  content: string // Actual content to process
}

interface BatchState {
  items: BatchItem[]
  processed: number
  results: Array<{ id: string; content: string; result: string }>
  usage: { inputTokens: number; outputTokens: number; cost: number }
  addResult: (id: string, content: string, result: string, tokens: { input: number; output: number }) => void
  incrementProcessed: () => void
}

const useStore = create<BatchState>((set) => ({
  items: [],
  processed: 0,
  results: [],
  usage: { inputTokens: 0, outputTokens: 0, cost: 0 },
  addResult: (id, content, result, tokens) =>
    set((state) => ({
      results: [...state.results, { id, content, result }],
      usage: {
        inputTokens: state.usage.inputTokens + tokens.input,
        outputTokens: state.usage.outputTokens + tokens.output,
        // Sonnet 4 pricing: $3/1M input, $15/1M output
        cost:
          state.usage.cost +
          (tokens.input * 3) / 1_000_000 +
          (tokens.output * 15) / 1_000_000,
      },
    })),
  incrementProcessed: () => set((state) => ({ processed: state.processed + 1 })),
}))

function BatchProcessor({ items, outputDir }: { items: BatchItem[]; outputDir: string }) {
  const { addResult, incrementProcessed } = useStore()

  // Initialize items in store
  if (useStore.getState().items.length === 0) {
    useStore.setState({ items })
  }

  return (
    <ClaudeProvider
      rateLimit={{
        requestsPerMinute: 50, // Anthropic API default tier limit
        tokensPerMinute: 50_000, // Input token limit
      }}
      usageLimit={{
        maxCost: 1.0, // Maximum $1.00 spend
        maxTokens: 100_000, // Maximum 100k tokens
      }}
      onRateLimited={(reason, waitTime) => {
        console.log(`⏳ Rate limited (${reason}), waiting ${waitTime}ms...`)
      }}
      onUsageUpdate={(stats) => {
        // Update progress display (could use for real-time dashboard)
        const percent = ((stats.totalRequests / items.length) * 100).toFixed(0)
        process.stdout.write(`\r  Progress: ${percent}% (${stats.totalRequests}/${items.length})`)
      }}
    >
      {items.map((item) => (
        <Claude
          key={item.id}
          model="claude-sonnet-4-20250514"
          maxTokens={1000}
          onFinished={(result) => {
            // Mock token usage for demo
            const inputTokens = item.content.length * 2 // Rough estimate
            const outputTokens = result.text.length * 1.5 // Rough estimate

            addResult(item.id, item.content, result.text, {
              input: inputTokens,
              output: outputTokens,
            })
            incrementProcessed()
          }}
        >
          Process this item and provide a summary:

          {item.content}

          Provide a concise analysis (2-3 sentences).
        </Claude>
      ))}
    </ClaudeProvider>
  )
}

function ResultsWriter({ outputDir }: { outputDir: string }) {
  const { results, items } = useStore.getState()

  // Only write when all items are processed
  if (results.length < items.length) {
    return null
  }

  return (
    <File path={`${outputDir}/results.json`}>
      {JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          total: results.length,
          results: results.map(({ id, result }) => ({
            id,
            result,
          })),
        },
        null,
        2
      )}
    </File>
  )
}

// Main execution
const inputPath = process.argv[2] || './examples'
const outputDir = process.argv[3] || './batch-results'

console.log('📦 Rate-Limited Batch Processing')
console.log(`  Input: ${inputPath}`)
console.log(`  Output: ${outputDir}`)
console.log()

// Load items to process
let items: BatchItem[] = []

try {
  const fileExists = await Bun.file(inputPath).exists()

  if (fileExists) {
    // Single file - split into lines
    const content = await readFile(inputPath, 'utf-8')
    const lines = content.split('\n').filter((line) => line.trim())
    items = lines.map((line, index) => ({
      id: `line-${index + 1}`,
      content: line,
    }))
  } else {
    // Directory - read file contents for processing
    const files = await readdir(inputPath)
    const relevantFiles = files.filter((f) => f.endsWith('.md') || f.endsWith('.txt'))

    // Read each file's contents
    for (const file of relevantFiles) {
      const filePath = join(inputPath, file)
      const content = await readFile(filePath, 'utf-8')
      items.push({
        id: file, // Use filename as unique identifier
        content,
      })
    }
  }
} catch (err) {
  console.error('❌ Failed to load items:', err)
  process.exit(1)
}

if (items.length === 0) {
  console.error('❌ No items to process')
  process.exit(1)
}

console.log(`  Items: ${items.length}`)
console.log()

const startTime = Date.now()

// Phase 1: Process all items with rate limiting
await executePlan(<BatchProcessor items={items} outputDir={outputDir} />, {
  mockMode: process.env.SMITHERS_MOCK === 'true',
})

// Phase 2: Write results
await executePlan(<ResultsWriter outputDir={outputDir} />, {
  mockMode: process.env.SMITHERS_MOCK === 'true',
})

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
const { processed, usage } = useStore.getState()

console.log()
console.log()
console.log('✅ Batch Processing Complete')
console.log(`  Time: ${elapsed}s`)
console.log(`  Processed: ${processed}/${items.length} items`)
console.log(`  Input tokens: ${usage.inputTokens.toLocaleString()}`)
console.log(`  Output tokens: ${usage.outputTokens.toLocaleString()}`)
console.log(`  Total cost: $${usage.cost.toFixed(4)}`)
console.log()
console.log(`Results written to: ${outputDir}/results.json`)

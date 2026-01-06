/**
 * Manual Test: Basic Claude API Execution
 *
 * This test verifies that the Claude API integration works correctly.
 * Run with: bun run manual-tests/01-basic-execution.tsx
 *
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import { Claude, renderPlan, executePlan } from '../src/index.js'

console.log('='.repeat(60))
console.log('Manual Test: Basic Claude API Execution')
console.log('='.repeat(60))
console.log()

// Check for API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not found in environment')
  console.error('   Set it with: export ANTHROPIC_API_KEY=your-key-here')
  process.exit(1)
}

console.log('✓ API key found')
console.log()

async function main() {
  try {
    // Test 1: Simple text generation
    console.log('Test 1: Simple text generation')
    console.log('-'.repeat(60))

    const SimpleAgent = () => (
      <Claude>
        What is 2 + 2? Answer with just the number.
      </Claude>
    )

    const plan1 = await renderPlan(<SimpleAgent />)
    console.log('Plan:', plan1)
    console.log()

    console.log('Executing...')
    const result1 = await executePlan(<SimpleAgent />, {
      verbose: true,
      maxFrames: 10,
    })

    console.log()
    console.log('Result:', result1)
    console.log('Output:', result1.output)
    console.log('Frames:', result1.frames)
    console.log('Duration:', result1.totalDuration, 'ms')
    console.log()
    console.log('✅ Test 1 passed')
    console.log()

  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

main()

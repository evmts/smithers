/**
 * Manual Test: Claude API with Tool Execution
 *
 * This test verifies that tool calling and the agentic loop work correctly.
 * Run with: bun run manual-tests/02-with-tools.tsx
 *
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import { Claude, renderPlan, executePlan } from '../src/index.js'
import type { Tool } from '../src/core/types.js'

console.log('='.repeat(60))
console.log('Manual Test: Claude API with Tool Execution')
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

// Define a simple calculator tool
const calculatorTool: Tool = {
  name: 'calculator',
  description: 'Performs basic arithmetic operations',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['add', 'subtract', 'multiply', 'divide'],
        description: 'The arithmetic operation to perform',
      },
      a: {
        type: 'number',
        description: 'The first operand',
      },
      b: {
        type: 'number',
        description: 'The second operand',
      },
    },
    required: ['operation', 'a', 'b'],
  },
  execute: async (input: { operation: string; a: number; b: number }) => {
    console.log(`  🔧 Calculator called: ${input.operation}(${input.a}, ${input.b})`)

    switch (input.operation) {
      case 'add':
        return { result: input.a + input.b }
      case 'subtract':
        return { result: input.a - input.b }
      case 'multiply':
        return { result: input.a * input.b }
      case 'divide':
        if (input.b === 0) {
          throw new Error('Division by zero')
        }
        return { result: input.a / input.b }
      default:
        throw new Error(`Unknown operation: ${input.operation}`)
    }
  },
}

async function main() {
  try {
    // Test 2: Tool calling
    console.log('Test 2: Tool calling with calculator')
    console.log('-'.repeat(60))

    const CalculatorAgent = () => (
      <Claude tools={[calculatorTool]}>
        Use the calculator tool to compute: (15 + 27) * 3
        Show your work step by step, then provide the final answer.
      </Claude>
    )

    const plan2 = await renderPlan(<CalculatorAgent />)
    console.log('Plan:', plan2)
    console.log()

    console.log('Executing...')
    const result2 = await executePlan(<CalculatorAgent />, {
      verbose: true,
      maxFrames: 10,
    })

    console.log()
    console.log('Result:', result2)
    console.log('Output:', result2.output)
    console.log('Frames:', result2.frames)
    console.log('Duration:', result2.totalDuration, 'ms')
    console.log()
    console.log('✅ Test 2 passed')
    console.log()

  } catch (error) {
    console.error('❌ Test failed:', error)
    if (error instanceof Error && error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()

/**
 * Test Smithers with MOCK mode (no API credits needed)
 *
 * Run with: bun run ./evals/test-cli-mock.tsx
 */
import { renderPlan, ClaudeCli, createSmithersSolidRoot } from '@evmts/smithers'
import { executePlan } from '../packages/smithers-core/dist/index.js'

function HelloWorldCli() {
  return (
    <ClaudeCli maxTurns={1}>
      What is 2 + 2? Answer in one word only.
    </ClaudeCli>
  )
}

async function main() {
  console.log('=== Smithers CLI Test (Mock Mode) ===\n')

  // First show the plan
  console.log('Rendered plan:')
  const plan = await renderPlan(() => <HelloWorldCli />)
  console.log(plan)
  console.log('\n---\n')

  // Execute in MOCK mode (no API needed!)
  console.log('Executing in mock mode...\n')

  const root = createSmithersSolidRoot()
  root.mount(() => <HelloWorldCli />)
  await root.flush()

  const result = await executePlan(root.getTree(), {
    mockMode: true,  // No API credits needed!
    rerender: async () => {
      await root.flush()
      return root.getTree()
    },
  })

  root.dispose()

  console.log('Result:', result.output)
  console.log('Frames:', result.frames)
  console.log('Duration:', result.totalDuration, 'ms')
}

main().catch(console.error)

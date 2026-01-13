/**
 * Test Smithers with REAL Claude CLI (uses Claude Code subscription, not API credits)
 *
 * Run with: bun run ./evals/test-cli-real.tsx
 */
import { renderPlan, ClaudeCli, createSmithersSolidRoot } from '@evmts/smithers'
import { executePlan } from '../packages/smithers-core/dist/index.js'

function HelloWorldCli() {
  return (
    <ClaudeCli maxTurns={1} allowedTools={[]}>
      What is 2 + 2? Answer in one word only.
    </ClaudeCli>
  )
}

async function main() {
  console.log('=== Smithers CLI Test ===\n')

  // First show the plan
  console.log('Rendered plan:')
  const plan = await renderPlan(() => <HelloWorldCli />)
  console.log(plan)
  console.log('\n---\n')

  // Execute with real CLI (mockMode: false)
  console.log('Executing with real Claude CLI...\n')

  const root = createSmithersSolidRoot()
  root.mount(() => <HelloWorldCli />)
  await root.flush()

  const result = await executePlan(root.getTree(), {
    mockMode: false,
    rerender: async () => {
      await root.flush()
      return root.getTree()
    },
  })

  root.dispose()

  console.log('\nResult:', result.output)
  console.log('Frames:', result.frames)
  console.log('Duration:', result.totalDuration, 'ms')
}

main().catch(console.error)

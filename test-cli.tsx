/**
 * Test Smithers with Claude CLI (uses Claude Code subscription, not API credits)
 *
 * Run with: bun run test-cli.tsx
 */
import { executePlan, ClaudeCli } from '@evmts/smithers'

function HelloWorldCli() {
  return (
    <ClaudeCli maxTurns={1}>
      What is 2 + 2? Answer in one word.
    </ClaudeCli>
  )
}

async function main() {
  console.log('Running test with Claude CLI...\n')

  const result = await executePlan(() => <HelloWorldCli />)

  console.log('\nResult:', result.output)
  console.log('Execution completed in', result.totalDuration, 'ms')
}

main().catch(console.error)

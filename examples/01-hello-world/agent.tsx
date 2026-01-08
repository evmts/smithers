/**
 * Hello World Example
 *
 * The simplest possible Smithers agent - just a Claude component
 * with a system prompt.
 *
 * Run with: bun run examples/01-hello-world/agent.tsx
 */
import { executePlan, Claude } from '@evmts/smithers'

// The simplest agent: just Claude with a prompt
function HelloWorld() {
  return (
    <Claude>
      You are a friendly AI assistant named Smithers. Say hello and introduce
      yourself in one sentence. Be warm and welcoming.
    </Claude>
  )
}

// Execute the agent
async function main() {
  console.log('Running Hello World agent...\n')

  const result = await executePlan(<HelloWorld />)

  console.log('Response:', result.output)
  console.log('\nExecution completed in', result.totalDuration, 'ms')
}

main().catch(console.error)

// Export for use as a module
export default <HelloWorld />

/**
 * Test Smithers with ClaudeApi using OAuth token
 */
import { renderPlan, ClaudeApi, createSmithersSolidRoot } from '@evmts/smithers'
import { executePlan } from '../packages/smithers-core/dist/index.js'

// Set the OAuth token as API key
process.env.ANTHROPIC_API_KEY = process.env.CLAUDE_OAUTH_TOKEN

function HelloWorldApi() {
  return (
    <ClaudeApi model="claude-sonnet-4-20250514" maxTokens={100}>
      What is 2 + 2? Answer in one word only.
    </ClaudeApi>
  )
}

async function main() {
  if (!process.env.CLAUDE_OAUTH_TOKEN) {
    console.error('Set CLAUDE_OAUTH_TOKEN environment variable')
    process.exit(1)
  }

  console.log('=== Smithers API Test with OAuth ===\n')

  const root = createSmithersSolidRoot()
  root.mount(() => <HelloWorldApi />)
  await root.flush()

  const result = await executePlan(root.getTree(), {
    mockMode: false,
    rerender: async () => {
      await root.flush()
      return root.getTree()
    },
  })

  root.dispose()

  console.log('Result:', result.output)
  console.log('Duration:', result.totalDuration, 'ms')
}

main().catch(console.error)

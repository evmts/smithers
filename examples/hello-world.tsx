/**
 * Simple example demonstrating Smithers usage
 */

import { createSignal } from '../src/solid/index.js'
import { Claude, Phase } from '../src/components/index.js'
import { createSmithersRoot, executePlan, serialize } from '../src/index.js'

function HelloAgent() {
  const [done, setDone] = createSignal(false)

  return (
    <Phase name="greeting">
      {!done() ? (
        <Claude
          model="claude-sonnet-4-5-20250929"
          maxTurns={1}
          onFinished={() => setDone(true)}
        >
          Say hello to the world
        </Claude>
      ) : (
        <Claude model="claude-sonnet-4-5-20250929" maxTurns={1}>
          Now say goodbye
        </Claude>
      )}
    </Phase>
  )
}

// Create a Smithers root
const root = createSmithersRoot()

// Mount the component
root.mount(HelloAgent)

// Serialize the tree to XML
console.log('=== Plan ===')
console.log(serialize(root.getTree()))
console.log()

// Execute the plan (mock mode for now since executors aren't implemented)
console.log('=== Execution ===')
try {
  const result = await executePlan(root.getTree(), { verbose: true })
  console.log('Result:', result)
} catch (error) {
  console.error('Execution error:', error)
}

// Clean up
root.dispose()

/**
 * Example demonstrating the "Ralph Wiggum loop" pattern.
 *
 * The key insight: Components execute themselves via onMount.
 * Changing the key prop forces unmount/remount, which triggers re-execution.
 *
 * Run with: bun examples/ralph-wiggum-loop.tsx
 */

import { createSignal, onMount, type JSX } from 'solid-js'
import { createSmithersRoot } from '../src/solid/index.js'

/**
 * A simple agent component that executes on mount.
 * This represents an agent task in the execution tree.
 */
function Agent(props: { name: string; children?: JSX.Element }): JSX.Element {
  onMount(() => {
    console.log(`[Agent ${props.name}] Executing on mount!`)
    // This is where the agent would do its work:
    // - Make API calls
    // - Process data
    // - Update state
  })

  return <agent name={props.name}>{props.children}</agent>
}

/**
 * Root component demonstrating the Ralph Wiggum loop.
 */
function App() {
  // This signal controls when the agent re-executes
  const [resetKey, setResetKey] = createSignal(0)

  // Changing the key forces the Agent to unmount and remount
  // which triggers the onMount handler again
  setTimeout(() => {
    console.log('\n[Ralph Wiggum] Changing key to force re-execution...\n')
    setResetKey(1)
  }, 1000)

  return (
    <plan>
      {/* The key prop is CRITICAL - changing it forces remount */}
      <Agent key={resetKey()} name="data-fetcher">
        <task name="fetch-users" />
        <task name="fetch-posts" />
      </Agent>
    </plan>
  )
}

// Create the root and mount the app
const root = createSmithersRoot()
root.mount(App)

// Display the XML representation
console.log('\n=== Agent Plan (XML) ===')
console.log(root.toXML())
console.log('========================\n')

// Keep the process alive to see the re-execution
setTimeout(() => {
  console.log('\n=== Final Tree (XML) ===')
  console.log(root.toXML())
  console.log('========================\n')
  root.dispose()
}, 2000)

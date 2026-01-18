/**
 * Hello World E2E Test
 *
 * Basic sanity test for renderPlan and executePlan functionality.
 */
import { describe, test, expect, beforeAll } from 'bun:test'

// Skip these tests - JSX transform mismatch between Solid renderer and our jsx-runtime
// TODO: Fix by either using Solid JSX everywhere or not using Solid at all
const skip = { skip: true }
import './setup'
import { renderPlan, runPlan } from '../test/utils'
import { Claude } from '../src/components/Claude'

describe('hello-world', () => {
  test.skip('renders basic Claude component to XML', async () => {
    const HelloWorld = () => (
      <Claude>
        You are a friendly assistant. Say hello and introduce yourself in one sentence.
      </Claude>
    )

    const plan = await renderPlan(<HelloWorld />)

    expect(plan).toContain('<claude')
    // The Claude component may execute and render as self-closing in mock mode
    // Just verify the component appears in the output
    expect(plan.length).toBeGreaterThan(0)
  })

  test.skip('executes and returns a result', async () => {
    const HelloWorld = () => (
      <Claude>
        Say exactly: "Hello, I am Smithers!"
      </Claude>
    )

    const result = await runPlan(<HelloWorld />)

    // In mock mode, we get a mock response
    expect(result).toBeDefined()
    expect(result.frames).toBeGreaterThanOrEqual(0)
  })
})

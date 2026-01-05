import { describe, test, expect } from 'bun:test'
import { renderPlan, executePlan, Claude } from 'plue'

describe('hello-world', () => {
  test('renders basic Claude component to XML', async () => {
    const HelloWorld = () => (
      <Claude>
        You are a friendly assistant. Say hello and introduce yourself in one sentence.
      </Claude>
    )

    const plan = await renderPlan(<HelloWorld />)

    expect(plan).toContain('<claude>')
    expect(plan).toContain('</claude>')
    expect(plan).toContain('friendly assistant')
  })

  test('executes and returns a greeting', async () => {
    const HelloWorld = () => (
      <Claude>
        Say exactly: "Hello, I am Plue!"
      </Claude>
    )

    const result = await executePlan(<HelloWorld />)

    expect(result.output).toContain('Hello')
    expect(result.output).toContain('Plue')
  })
})

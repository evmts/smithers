import { describe, test, expect } from 'bun:test'
import './setup.ts'
import { renderPlan, executePlan, Claude } from '../src/index.js'

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
        Say exactly: "Hello, I am Smithers!"
      </Claude>
    )

    const result = await executePlan(<HelloWorld />)

    expect(result.output).toContain('Hello')
    expect(result.output).toContain('Smithers')
  })
})

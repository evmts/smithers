/**
 * Type check verification demo.
 * This file should have NO red squiggles in your editor.
 *
 * Run: bun run typecheck
 * This file won't be compiled (excluded from build), but will be type-checked.
 */

import type { JSX } from 'solid-js'

// Example 1: All custom elements should be recognized
function Example1(): JSX.Element {
  return (
    <claude model="sonnet">
      <ralph maxIterations={3}>
        <phase name="test">
          <step>Do work</step>
        </phase>
      </ralph>
    </claude>
  )
}

// Example 2: Key prop should work on custom elements
function Example2(): JSX.Element {
  const key = 'unique-123'
  return (
    <ralph key={key} maxIterations={5}>
      <phase name="analysis">
        <claude model="opus">Analyze the problem</claude>
      </phase>
    </ralph>
  )
}

// Example 3: Semantic elements
function Example3(): JSX.Element {
  return (
    <persona role="engineer" expertise="systems">
      <constraints>
        Work within budget and timeline
      </constraints>
    </persona>
  )
}

// Example 4: Event handlers and validation
function Example4(): JSX.Element {
  const handleFinished = (result: unknown) => {
    console.log('Finished:', result)
  }

  const handleError = (error: Error) => {
    console.error('Error:', error)
  }

  const validate = async (result: unknown) => {
    return result !== null
  }

  return (
    <claude
      model="sonnet"
      maxTurns={10}
      tools={['bash', 'grep']}
      systemPrompt="You are a helpful assistant"
      onFinished={handleFinished}
      onError={handleError}
      validate={validate}
    >
      Test prompt
    </claude>
  )
}

// Example 5: Generic elements for tests
function Example5(): JSX.Element {
  return (
    <container>
      <task name="build">Build the project</task>
      <agent type="worker">
        <message>Process this</message>
      </agent>
    </container>
  )
}

export { Example1, Example2, Example3, Example4, Example5 }

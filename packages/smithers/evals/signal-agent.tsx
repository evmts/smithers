/**
 * Multi-phase Signal Agent - Works with Smithers CLI for Tauri testing
 *
 * This agent demonstrates the Ralph Wiggum loop with SolidJS signals.
 * Run with: smithers run ./evals/signal-agent.tsx
 */
// Import createSignal from @evmts/smithers to get browser build with reactivity
import { createSignal, ClaudeCli, Phase } from '../dist/index.js'

// Signals for multi-phase state management
const [phase, setPhase] = createSignal<'math' | 'multiply' | 'done'>('math')
const [mathResult, setMathResult] = createSignal('')

export default function SignalAgent() {
  const currentPhase = phase()

  if (currentPhase === 'math') {
    return (
      <Phase name="math">
        <ClaudeCli
          maxTurns={1}
          onFinished={(output: unknown) => {
            setMathResult(String(output).trim())
            setPhase('multiply')
          }}
        >
          What is 2 + 2? Answer with just the number, nothing else.
        </ClaudeCli>
      </Phase>
    )
  }

  if (currentPhase === 'multiply') {
    return (
      <Phase name="multiply">
        <ClaudeCli
          maxTurns={1}
          onFinished={() => setPhase('done')}
        >
          The previous answer was: {mathResult()}. Multiply that by 10. Answer with just the number, nothing else.
        </ClaudeCli>
      </Phase>
    )
  }

  // Done - return null to end the loop
  return null
}

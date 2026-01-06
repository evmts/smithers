/**
 * Manual Test: Multi-Phase Agent with State Management
 *
 * This test verifies that the Ralph Wiggum loop works with state transitions.
 * Run with: bun run manual-tests/03-multi-phase.tsx
 *
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import { create } from 'zustand'
import { Claude, Phase, Step, renderPlan, executePlan } from '../src/index.js'

console.log('='.repeat(60))
console.log('Manual Test: Multi-Phase Agent with State Management')
console.log('='.repeat(60))
console.log()

// Check for API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not found in environment')
  console.error('   Set it with: export ANTHROPIC_API_KEY=your-key-here')
  process.exit(1)
}

console.log('✓ API key found')
console.log()

// Create store for agent state
const useStore = create<{
  phase: 'brainstorm' | 'analyze' | 'decide' | 'done'
  ideas: string[]
  analysis: string | null
  setIdeas: (ideas: string[]) => void
  setAnalysis: (analysis: string) => void
  setPhase: (phase: 'brainstorm' | 'analyze' | 'decide' | 'done') => void
}>((set) => ({
  phase: 'brainstorm',
  ideas: [],
  analysis: null,
  setIdeas: (ideas) => set({ ideas, phase: 'analyze' }),
  setAnalysis: (analysis) => set({ analysis, phase: 'decide' }),
  setPhase: (phase) => set({ phase }),
}))

function MultiPhaseAgent() {
  const { phase, ideas, analysis, setIdeas, setAnalysis, setPhase } = useStore()

  console.log(`  [Render] Current phase: ${phase}`)

  if (phase === 'brainstorm') {
    return (
      <Claude
        onFinished={(result: { ideas: string[] }) => {
          console.log(`  [Callback] Received ${result.ideas.length} ideas`)
          setIdeas(result.ideas)
        }}
      >
        <Phase name="brainstorm">
          <Step>Think of 3 creative names for a pet robot</Step>
          <Step>Return as JSON: {"{"}"ideas": ["name1", "name2", "name3"]{"}"}</Step>
        </Phase>
      </Claude>
    )
  }

  if (phase === 'analyze') {
    return (
      <Claude
        onFinished={(result: { analysis: string }) => {
          console.log(`  [Callback] Received analysis`)
          setAnalysis(result.analysis)
        }}
      >
        <Phase name="analyze">
          <Step>Analyze these robot names: {ideas.join(', ')}</Step>
          <Step>Pick the best one and explain why</Step>
          <Step>Return as JSON: {"{"}"analysis": "explanation", "best": "name"{"}"}</Step>
        </Phase>
      </Claude>
    )
  }

  if (phase === 'decide') {
    return (
      <Claude onFinished={() => setPhase('done')}>
        <Phase name="decide">
          Based on this analysis: {analysis}

          Confirm the final choice and say "Decision complete!"
        </Phase>
      </Claude>
    )
  }

  return <div>All phases complete!</div>
}

async function main() {
  try {
    console.log('Test 3: Multi-phase agent with state transitions')
    console.log('-'.repeat(60))
    console.log()

    console.log('Executing...')
    const result = await executePlan(<MultiPhaseAgent />, {
      verbose: true,
      maxFrames: 10,
    })

    console.log()
    console.log('Result:', result)
    console.log('Frames executed:', result.frames)
    console.log('Duration:', result.totalDuration, 'ms')
    console.log()
    console.log('Final state:')
    console.log('  Phase:', useStore.getState().phase)
    console.log('  Ideas:', useStore.getState().ideas)
    console.log('  Analysis:', useStore.getState().analysis)
    console.log()
    console.log('✅ Test 3 passed')
    console.log()

  } catch (error) {
    console.error('❌ Test failed:', error)
    if (error instanceof Error && error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()

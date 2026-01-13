/**
 * Test Smithers signals with real Claude CLI - IDIOMATIC SOLIDJS
 *
 * This tests the "Ralph Wiggum loop" - signal changes trigger re-renders
 * which produce new nodes that get executed.
 *
 * IMPORTANT: Run with browser condition for SolidJS reactivity:
 *   CLAUDE_CODE_OAUTH_TOKEN=... bun --conditions=browser run ./evals/test-signal-real.tsx
 */
import { createSignal } from 'solid-js'
import { ClaudeCli, createSmithersSolidRoot, serialize } from '../dist/index.js'
import { executePlan } from '../../smithers-core/dist/index.js'

async function main() {
  console.log('=== Smithers Signal Test (Idiomatic SolidJS) ===\n')

  // Signals for multi-phase state management
  const [phase, setPhase] = createSignal<'first' | 'second' | 'done'>('first')
  const [firstResult, setFirstResult] = createSignal('')

  // Idiomatic SolidJS component - conditional logic is reactive!
  const App = () => {
    const currentPhase = phase()
    console.log(`[Render] Current phase: ${currentPhase}`)

    if (currentPhase === 'first') {
      return (
        <ClaudeCli
          maxTurns={1}
          onFinished={(output: string) => {
            console.log(`[Phase 1 Complete] Got: "${output}"`)
            setFirstResult(output)
            setPhase('second')
          }}
        >
          What is 2 + 2? Answer with just the number.
        </ClaudeCli>
      )
    }

    if (currentPhase === 'second') {
      const prevResult = firstResult()
      console.log(`[Phase 2] Using result from phase 1: "${prevResult}"`)
      return (
        <ClaudeCli
          maxTurns={1}
          onFinished={(output: string) => {
            console.log(`[Phase 2 Complete] Got: "${output}"`)
            setPhase('done')
          }}
        >
          The previous answer was: {prevResult}. Now multiply that by 10. Answer with just the number.
        </ClaudeCli>
      )
    }

    console.log('[Done] All phases complete')
    return null
  }

  // Mount and execute
  const root = createSmithersSolidRoot()
  root.mount(App)
  await root.flush()

  console.log('[Initial tree]:', serialize(root.getTree()))

  const result = await executePlan(root.getTree(), {
    mockMode: false,
    maxFrames: 5,
    rerender: async () => {
      console.log('\n[Rerender] Flushing signal updates...')
      await root.flush()
      const tree = root.getTree()
      console.log('[New tree]:', serialize(tree))
      return tree
    },
  })

  root.dispose()

  console.log('\n=== Results ===')
  console.log('Final output:', result.output)
  console.log('Total frames:', result.frames)
  console.log('Duration:', result.totalDuration, 'ms')
}

main().catch(console.error)

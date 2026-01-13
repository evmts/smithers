/**
 * Test Smithers signals with real Claude CLI
 *
 * This tests the "Ralph Wiggum loop" - signal changes trigger re-renders
 * which produce new nodes that get executed.
 *
 * Run with: CLAUDE_CODE_OAUTH_TOKEN=... bun run ./evals/test-signal-real.tsx
 */
import { createSignal } from 'solid-js'
import { ClaudeCli, createSmithersSolidRoot } from '@evmts/smithers'
import { executePlan } from '../packages/smithers-core/dist/index.js'

function MultiPhaseAgent() {
  const [phase, setPhase] = createSignal<'first' | 'second' | 'done'>('first')
  const [firstResult, setFirstResult] = createSignal('')

  console.log(`[Render] Current phase: ${phase()}`)

  if (phase() === 'first') {
    return (
      <ClaudeCli
        maxTurns={1}
        onFinished={(output: string) => {
          console.log(`[Phase 1 Complete] Got: ${output}`)
          setFirstResult(output)
          setPhase('second')
        }}
      >
        What is 2 + 2? Answer with just the number.
      </ClaudeCli>
    )
  }

  if (phase() === 'second') {
    return (
      <ClaudeCli
        maxTurns={1}
        onFinished={(output: string) => {
          console.log(`[Phase 2 Complete] Got: ${output}`)
          setPhase('done')
        }}
      >
        The previous answer was: {firstResult()}.
        Now multiply that by 10. Answer with just the number.
      </ClaudeCli>
    )
  }

  // Done - return null to stop the loop
  return null
}

async function main() {
  console.log('=== Smithers Signal Test (Real CLI) ===\n')

  const root = createSmithersSolidRoot()
  root.mount(() => <MultiPhaseAgent />)
  await root.flush()

  const result = await executePlan(root.getTree(), {
    mockMode: false,
    maxFrames: 5,
    rerender: async () => {
      console.log('[Rerender] Signal changed, re-rendering...')
      await root.flush()
      return root.getTree()
    },
  })

  root.dispose()

  console.log('\n=== Results ===')
  console.log('Final output:', result.output)
  console.log('Total frames:', result.frames)
  console.log('Duration:', result.totalDuration, 'ms')
}

main().catch(console.error)

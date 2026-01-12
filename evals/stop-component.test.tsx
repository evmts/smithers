import { describe, test, expect } from 'bun:test'
import './setup.ts'
import { create } from 'zustand'
import { renderPlan, executePlan, Claude, Phase, Stop } from '@evmts/smithers'

describe('Stop component', () => {
  test('renders Stop component in XML plan', async () => {
    function AgentWithStop({ shouldStop }: { shouldStop: boolean }) {
      return (
        <>
          <Claude>
            <Phase name="work">Do some work</Phase>
          </Claude>
          {shouldStop && <Stop reason="Work complete" />}
        </>
      )
    }

    const planWithoutStop = await renderPlan(<AgentWithStop shouldStop={false} />)
    const planWithStop = await renderPlan(<AgentWithStop shouldStop={true} />)

    expect(planWithoutStop).not.toContain('<stop')
    expect(planWithStop).toContain('<stop')
    expect(planWithStop).toContain('reason="Work complete"')
  })

  test('Stop component halts the Ralph Wiggum loop', async () => {
    const phases: string[] = []

    // Create a fresh store for this test
    const useStopStore = create<{
      phase: string
      iterationCount: number
      setPhase: (phase: string) => void
      incrementIteration: () => void
    }>((set) => ({
      phase: 'phase1',
      iterationCount: 0,
      setPhase: (phase) => set({ phase }),
      incrementIteration: () => set((state) => ({ iterationCount: state.iterationCount + 1 })),
    }))

    function StopLoopAgent() {
      const { phase, iterationCount, setPhase, incrementIteration } = useStopStore()

      console.log(`[TEST] Render: phase = ${phase}, iteration = ${iterationCount}`)
      phases.push(phase)

      if (phase === 'phase1') {
        return (
          <Claude
            onFinished={() => {
              console.log('[TEST] onFinished for phase1, calling setPhase("phase2")')
              incrementIteration()
              setPhase('phase2')
            }}
          >
            <Phase name="phase1">First phase</Phase>
          </Claude>
        )
      }

      if (phase === 'phase2') {
        return (
          <Claude
            onFinished={() => {
              console.log('[TEST] onFinished for phase2, calling setPhase("phase3")')
              incrementIteration()
              setPhase('phase3')
            }}
          >
            <Phase name="phase2">Second phase</Phase>
          </Claude>
        )
      }

      if (phase === 'phase3') {
        return (
          <>
            <Claude
              onFinished={() => {
                console.log('[TEST] onFinished for phase3, calling setPhase("done")')
                incrementIteration()
                setPhase('done')
              }}
            >
              <Phase name="phase3">Third phase</Phase>
            </Claude>
            <Stop reason="Three phases complete" />
          </>
        )
      }

      return <div>Done!</div>
    }

    console.log('[TEST] Starting executePlan with Stop')
    const result = await executePlan(<StopLoopAgent />, {
      maxFrames: 10,
      verbose: true,
    })

    console.log('[TEST] Phases executed:', phases)
    console.log('[TEST] Iteration count:', useStopStore.getState().iterationCount)

    // Stop component should halt the loop when it appears in the tree
    // The component renders multiple times due to React's state update batching
    // The important thing is that:
    // 1. The Stop node halted execution (frame count is less than maxFrames)
    // 2. phase1 and phase2 executed successfully (iteration count is 2)
    // 3. phase3 never executed because Stop appeared

    // Verify Stop halted the loop early
    expect(result.frames).toBeLessThanOrEqual(3)

    // Verify we executed phase1 and phase2 (2 iterations)
    expect(useStopStore.getState().iterationCount).toBe(2)

    // Verify we reached phase3 state but Stop prevented execution
    expect(useStopStore.getState().phase).toBe('phase3')

    // Verify phases includes at least phase1, phase2, phase3
    expect(phases).toContain('phase1')
    expect(phases).toContain('phase2')
    expect(phases).toContain('phase3')
  })

  test('Stop component without reason prop', async () => {
    function SimpleStopAgent({ shouldStop }: { shouldStop: boolean }) {
      return (
        <>
          <Claude>
            <Phase name="work">Do work</Phase>
          </Claude>
          {shouldStop && <Stop />}
        </>
      )
    }

    const result = await executePlan(<SimpleStopAgent shouldStop={true} />, {
      maxFrames: 10,
    })

    // Should execute once and then stop
    expect(result.frames).toBe(1)
  })

  test('Multiple phases with conditional Stop', async () => {
    const useLimitStore = create<{
      count: number
      increment: () => void
    }>((set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
    }))

    function LimitedAgent() {
      const { count, increment } = useLimitStore()
      const shouldStop = count >= 3

      return (
        <>
          <Claude onFinished={increment}>
            <Phase name="work">Iteration {count}</Phase>
          </Claude>
          {shouldStop && <Stop reason="Reached iteration limit" />}
        </>
      )
    }

    const result = await executePlan(<LimitedAgent />, {
      maxFrames: 20, // High limit to ensure Stop component works
    })

    // Should execute 3 times, then stop on the 4th render when shouldStop becomes true
    expect(useLimitStore.getState().count).toBe(3)
    expect(result.frames).toBeLessThanOrEqual(4)
  })
})

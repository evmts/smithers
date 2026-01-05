import { describe, test, expect } from 'bun:test'
import { create } from 'zustand'
import { renderPlan, executePlan, Claude, Phase, Step } from '../src/index.js'

describe('multi-phase', () => {
  test('renders different plans based on props', async () => {
    function ResearchAgent({ initialPhase }: { initialPhase: string }) {
      if (initialPhase === 'gather') {
        return (
          <Claude>
            <Phase name="gather">
              <Step>Search for sources</Step>
            </Phase>
          </Claude>
        )
      }

      return (
        <Claude>
          <Phase name="analyze">
            <Step>Synthesize findings</Step>
          </Phase>
        </Claude>
      )
    }

    const gatherPlan = await renderPlan(<ResearchAgent initialPhase="gather" />)
    const analyzePlan = await renderPlan(<ResearchAgent initialPhase="analyze" />)

    expect(gatherPlan).toContain('phase name="gather"')
    expect(gatherPlan).toContain('Search for sources')

    expect(analyzePlan).toContain('phase name="analyze"')
    expect(analyzePlan).toContain('Synthesize findings')
  })

  test('state transitions trigger re-renders (Ralph Wiggum loop)', async () => {
    const phases: string[] = []

    // Create a fresh store for this test
    const usePhaseStore = create<{
      phase: string
      setPhase: (phase: string) => void
    }>((set) => ({
      phase: 'phase1',
      setPhase: (phase) => set({ phase }),
    }))

    function MultiPhaseAgent() {
      const { phase, setPhase } = usePhaseStore()

      console.log(`[TEST] Render: phase = ${phase}`)
      phases.push(phase)

      if (phase === 'phase1') {
        return (
          <Claude onFinished={() => {
            console.log('[TEST] onFinished for phase1, calling setPhase("phase2")')
            setPhase('phase2')
          }}>
            <Phase name="phase1">First phase</Phase>
          </Claude>
        )
      }

      if (phase === 'phase2') {
        return (
          <Claude onFinished={() => {
            console.log('[TEST] onFinished for phase2, calling setPhase("phase3")')
            setPhase('phase3')
          }}>
            <Phase name="phase2">Second phase</Phase>
          </Claude>
        )
      }

      if (phase === 'phase3') {
        return (
          <Claude onFinished={() => {
            console.log('[TEST] onFinished for phase3')
            setPhase('done')
          }}>
            <Phase name="phase3">Final phase</Phase>
          </Claude>
        )
      }

      // Done - no more work
      return <div>Complete</div>
    }

    console.log('[TEST] Starting executePlan')
    await executePlan(<MultiPhaseAgent />, { verbose: true })

    expect(phases).toContain('phase1')
    expect(phases).toContain('phase2')
    expect(phases).toContain('phase3')
  })

  test('onFinished receives structured output and updates state', async () => {
    let capturedOutput: any = null

    const useDataStore = create<{
      data: any
      setData: (data: any) => void
    }>((set) => ({
      data: null,
      setData: (data) => set({ data }),
    }))

    function StatefulAgent() {
      const { data, setData } = useDataStore()

      if (!data) {
        return (
          <Claude
            onFinished={(output) => {
              capturedOutput = output
              setData(output)
            }}
          >
            Return exactly: {"{"}"result": "success"{"}"}
          </Claude>
        )
      }

      return (
        <Claude>
          Previous result: {JSON.stringify(data)}
        </Claude>
      )
    }

    await executePlan(<StatefulAgent />)

    expect(capturedOutput).toBeDefined()
    expect(capturedOutput.result).toBe('success')
  })
})

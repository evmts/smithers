import { describe, test, expect } from 'bun:test'
import { useState } from 'react'
import { renderPlan, executePlan } from 'plue'
import { Claude, Phase, Step } from 'plue/components'

describe('multi-phase', () => {
  test('renders different plans based on state', async () => {
    function ResearchAgent({ initialPhase }: { initialPhase: string }) {
      const [phase] = useState(initialPhase)

      if (phase === 'gather') {
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

    function MultiPhaseAgent() {
      const [phase, setPhase] = useState('phase1')

      phases.push(phase)

      if (phase === 'phase1') {
        return (
          <Claude onFinished={() => setPhase('phase2')}>
            <Phase name="phase1">First phase</Phase>
          </Claude>
        )
      }

      if (phase === 'phase2') {
        return (
          <Claude onFinished={() => setPhase('phase3')}>
            <Phase name="phase2">Second phase</Phase>
          </Claude>
        )
      }

      return (
        <Claude onFinished={() => setPhase('done')}>
          <Phase name="phase3">Final phase</Phase>
        </Claude>
      )
    }

    await executePlan(<MultiPhaseAgent />)

    expect(phases).toContain('phase1')
    expect(phases).toContain('phase2')
    expect(phases).toContain('phase3')
  })

  test('onFinished receives structured output and updates state', async () => {
    let capturedOutput: any = null

    function StatefulAgent() {
      const [data, setData] = useState<any>(null)

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

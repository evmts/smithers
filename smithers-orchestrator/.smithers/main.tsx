#!/usr/bin/env bun
import { create } from 'zustand'
import { createSmithersRoot } from 'smithers'
import { Ralph } from 'smithers/components/Ralph'
import { Claude } from 'smithers/components/Claude'
import { Phase } from 'smithers/components/Phase'

/**
 * Smithers Orchestration Template
 *
 * This is a declarative AI agent workflow using the Smithers framework.
 * Edit this file to define your multi-agent orchestration.
 *
 * Run with:
 *   bunx smithers-orchestrator monitor
 */

// Define state with Zustand
const useStore = create((set) => ({
  phase: 'initial',
  data: null,
  setPhase: (phase: string) => set({ phase }),
  setData: (data: any) => set({ data }),
}))

// Define your orchestration
function Orchestration() {
  const { phase, setPhase, data, setData } = useStore()

  return (
    <Ralph maxIterations={10}>
      {phase === 'initial' && (
        <Phase name="Phase 1: Initial Task">
          <Claude
            model="sonnet"
            onFinished={(result) => {
              console.log('Phase 1 complete:', result)
              setData(result)
              setPhase('done')
            }}
            onError={(error) => {
              console.error('Phase 1 error:', error)
              setPhase('error')
            }}
          >
            {/*
              Your prompt here.
              This agent will execute when the orchestration starts.
              Use onFinished to transition to the next phase.
            */}
            Hello, I am an AI agent. What would you like me to do?
          </Claude>
        </Phase>
      )}

      {phase === 'done' && (
        <Phase name="Complete">
          {/* Terminal state - no more agents to execute */}
          <div>Orchestration complete!</div>
        </Phase>
      )}

      {phase === 'error' && (
        <Phase name="Error Recovery">
          {/* Handle errors here */}
          <div>An error occurred. Check the logs.</div>
        </Phase>
      )}
    </Ralph>
  )
}

// Display plan before execution
const root = createSmithersRoot()
console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║            SMITHERS ORCHESTRATION PLAN                   ║')
console.log('╚══════════════════════════════════════════════════════════╝')
console.log('')
console.log(root.toXML())
console.log('')
console.log('═══════════════════════════════════════════════════════════')
console.log('')

// Execute the orchestration
root.mount(() => <Orchestration />)

// Keep process alive
await new Promise(() => {})

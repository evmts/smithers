import { describe, test, expect, beforeEach } from 'bun:test'
import React, { useState } from 'react'
import { create } from 'zustand'
import {
  executePlan,
  Claude,
  Phase,
  Stop,
  Human,
  formatAsCompact,
  formatAsPrettyTerminal,
  formatTreeAsAscii,
  type SmithersDebugEvent,
  type DebugSummary,
} from '../src/index.js'

// Set mock mode for testing
process.env.SMITHERS_MOCK_MODE = 'true'

describe('Debug Observability', () => {
  describe('formatAsCompact', () => {
    test('returns correct summary from collected events', async () => {
      const events: SmithersDebugEvent[] = []

      function SimpleAgent() {
        return (
          <Claude onFinished={() => {}}>
            Say hello
          </Claude>
        )
      }

      await executePlan(<SimpleAgent />, {
        debug: {
          enabled: true,
          onEvent: (e) => events.push(e),
        },
      })

      const summary = formatAsCompact(events)

      expect(summary.frameCount).toBeGreaterThanOrEqual(1)
      expect(summary.executedNodes.length).toBeGreaterThanOrEqual(1)
      expect(summary.callbacksInvoked).toContain('onFinished')
      expect(summary.terminationReason).toBe('no_pending_nodes')
    })

    test('tracks state changes', async () => {
      const events: SmithersDebugEvent[] = []

      const useStore = create<{ done: boolean; setDone: () => void }>((set) => ({
        done: false,
        setDone: () => set({ done: true }),
      }))

      function MultiPhaseAgent() {
        const { done, setDone } = useStore()

        if (done) {
          return <Phase name="complete">Done!</Phase>
        }

        return (
          <Claude onFinished={() => setDone()}>
            Phase 1
          </Claude>
        )
      }

      await executePlan(<MultiPhaseAgent />, {
        debug: {
          enabled: true,
          onEvent: (e) => events.push(e),
        },
      })

      const summary = formatAsCompact(events)

      expect(summary.stateChanges).toBeGreaterThanOrEqual(1)
      expect(summary.callbacksInvoked).toContain('onFinished')
    })
  })

  describe('event filtering', () => {
    test('filters events by type', async () => {
      const events: SmithersDebugEvent[] = []

      function SimpleAgent() {
        return (
          <Claude onFinished={() => {}}>
            Hello
          </Claude>
        )
      }

      await executePlan(<SimpleAgent />, {
        debug: {
          enabled: true,
          onEvent: (e) => events.push(e),
          eventFilter: ['node:execute:start', 'node:execute:end'],
        },
      })

      // Should only have execution events
      expect(events.every((e) =>
        e.type === 'node:execute:start' || e.type === 'node:execute:end'
      )).toBe(true)
      expect(events.length).toBeGreaterThanOrEqual(2) // At least start and end
    })
  })

  describe('event types', () => {
    test('emits frame:start and frame:end events', async () => {
      const events: SmithersDebugEvent[] = []

      function SimpleAgent() {
        return <Claude>Hello</Claude>
      }

      await executePlan(<SimpleAgent />, {
        debug: {
          enabled: true,
          onEvent: (e) => events.push(e),
        },
      })

      const frameStarts = events.filter((e) => e.type === 'frame:start')
      const frameEnds = events.filter((e) => e.type === 'frame:end')

      expect(frameStarts.length).toBeGreaterThanOrEqual(1)
      expect(frameEnds.length).toBeGreaterThanOrEqual(1)
    })

    test('emits node:found events for pending nodes', async () => {
      const events: SmithersDebugEvent[] = []

      function SimpleAgent() {
        return <Claude>Hello</Claude>
      }

      await executePlan(<SimpleAgent />, {
        debug: {
          enabled: true,
          onEvent: (e) => events.push(e),
        },
      })

      const nodeFoundEvents = events.filter((e) => e.type === 'node:found')

      expect(nodeFoundEvents.length).toBeGreaterThanOrEqual(1)
      expect(nodeFoundEvents[0]).toHaveProperty('nodePath')
      expect(nodeFoundEvents[0]).toHaveProperty('nodeType')
      expect(nodeFoundEvents[0]).toHaveProperty('contentHash')
    })

    test('emits node:execute:start and node:execute:end with timing', async () => {
      const events: SmithersDebugEvent[] = []

      function SimpleAgent() {
        return <Claude>Hello</Claude>
      }

      await executePlan(<SimpleAgent />, {
        debug: {
          enabled: true,
          onEvent: (e) => events.push(e),
        },
      })

      const execStart = events.find((e) => e.type === 'node:execute:start')
      const execEnd = events.find((e) => e.type === 'node:execute:end')

      expect(execStart).toBeDefined()
      expect(execEnd).toBeDefined()

      if (execEnd && execEnd.type === 'node:execute:end') {
        expect(execEnd.duration).toBeGreaterThanOrEqual(0)
        expect(execEnd.status).toBe('complete')
      }
    })

    test('emits control:stop when Stop component is present', async () => {
      const events: SmithersDebugEvent[] = []

      function AgentWithStop() {
        return (
          <>
            <Stop reason="Test complete" />
            <Claude>This should not execute</Claude>
          </>
        )
      }

      await executePlan(<AgentWithStop />, {
        debug: {
          enabled: true,
          onEvent: (e) => events.push(e),
        },
      })

      const stopEvent = events.find((e) => e.type === 'control:stop')
      const terminatedEvent = events.find((e) => e.type === 'loop:terminated')

      expect(stopEvent).toBeDefined()
      if (stopEvent && stopEvent.type === 'control:stop') {
        expect(stopEvent.reason).toBe('Test complete')
      }

      expect(terminatedEvent).toBeDefined()
      if (terminatedEvent && terminatedEvent.type === 'loop:terminated') {
        expect(terminatedEvent.reason).toBe('stop_node')
      }
    })

    test('emits control:human when Human component is present', async () => {
      const events: SmithersDebugEvent[] = []

      function AgentWithHuman() {
        return (
          <>
            <Human message="Please approve">
              Review this plan
            </Human>
            <Claude>Continue after approval</Claude>
          </>
        )
      }

      await executePlan(<AgentWithHuman />, {
        debug: {
          enabled: true,
          onEvent: (e) => events.push(e),
        },
        // Auto-approve by not providing onHumanPrompt
      })

      const humanEvents = events.filter((e) => e.type === 'control:human')

      expect(humanEvents.length).toBeGreaterThanOrEqual(1)
      if (humanEvents[0] && humanEvents[0].type === 'control:human') {
        expect(humanEvents[0].message).toBe('Please approve')
      }
    })
  })

  describe('formatAsPrettyTerminal', () => {
    test('formats events as readable terminal output', async () => {
      const events: SmithersDebugEvent[] = []

      function SimpleAgent() {
        return <Claude onFinished={() => {}}>Hello</Claude>
      }

      await executePlan(<SimpleAgent />, {
        debug: {
          enabled: true,
          onEvent: (e) => events.push(e),
        },
      })

      const output = formatAsPrettyTerminal(events)

      // Should contain frame headers
      expect(output).toContain('=== Frame')
      // Should contain execution info
      expect(output).toContain('[FRAME]')
    })
  })

  describe('tree snapshots', () => {
    test('includes tree snapshots when enabled', async () => {
      const events: SmithersDebugEvent[] = []

      function SimpleAgent() {
        return (
          <Phase name="greeting">
            <Claude>Hello</Claude>
          </Phase>
        )
      }

      await executePlan(<SimpleAgent />, {
        debug: {
          enabled: true,
          onEvent: (e) => events.push(e),
          includeTreeSnapshots: true,
        },
      })

      const renderEvent = events.find((e) => e.type === 'frame:render')

      expect(renderEvent).toBeDefined()
      if (renderEvent && renderEvent.type === 'frame:render') {
        expect(renderEvent.treeSnapshot).toBeDefined()
        expect(renderEvent.treeSnapshot?.type).toBe('ROOT')
      }
    })

    test('formatTreeAsAscii renders tree visualization', async () => {
      const events: SmithersDebugEvent[] = []

      function SimpleAgent() {
        return (
          <Phase name="greeting">
            <Claude>Hello</Claude>
          </Phase>
        )
      }

      await executePlan(<SimpleAgent />, {
        debug: {
          enabled: true,
          onEvent: (e) => events.push(e),
          includeTreeSnapshots: true,
        },
      })

      const renderEvent = events.find((e) => e.type === 'frame:render')

      if (renderEvent?.type === 'frame:render' && renderEvent.treeSnapshot) {
        const asciiTree = formatTreeAsAscii(renderEvent.treeSnapshot)

        // Should be a multi-line string
        expect(asciiTree).toContain('\n')
        // Should contain node types
        expect(asciiTree).toContain('ROOT')
      }
    })
  })

  describe('disabled debug', () => {
    test('no events collected when debug is disabled', async () => {
      const events: SmithersDebugEvent[] = []

      function SimpleAgent() {
        return <Claude>Hello</Claude>
      }

      await executePlan(<SimpleAgent />, {
        debug: {
          enabled: false,
          onEvent: (e) => events.push(e),
        },
      })

      expect(events.length).toBe(0)
    })

    test('no overhead when debug option is not provided', async () => {
      function SimpleAgent() {
        return <Claude>Hello</Claude>
      }

      // Should complete without errors
      const result = await executePlan(<SimpleAgent />)
      expect(result.output).toBeDefined()
    })
  })
})

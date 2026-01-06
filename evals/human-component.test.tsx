import { describe, test, expect } from 'bun:test'
import './setup.ts'
import { useState } from 'react'
import { executePlan, Claude, Human, Phase } from '../src/index.js'

/**
 * Tests for the Human component - interactive approval points in execution.
 *
 * Tests:
 * - Human node pauses execution and waits for approval
 * - onApprove callback triggers state changes
 * - onReject callback halts execution
 * - Auto-approval when no onHumanPrompt provided
 * - Message and content extraction
 */
describe('human-component', () => {
  test('Human node pauses execution and auto-approves without onHumanPrompt', async () => {
    const executionLog: string[] = []

    function AgentWithHuman() {
      const [phase, setPhase] = useState<'start' | 'review' | 'end'>('start')

      if (phase === 'start') {
        return (
          <Claude
            onFinished={() => {
              executionLog.push('start-phase-complete')
              setPhase('review')
            }}
          >
            <Phase name="start">Starting work...</Phase>
          </Claude>
        )
      }

      if (phase === 'review') {
        return (
          <>
            <Human
              message="Please review the work"
              onApprove={() => {
                executionLog.push('human-approved')
                setPhase('end')
              }}
            >
              Here are the changes made in the start phase.
            </Human>
            <Claude onFinished={() => executionLog.push('should-not-execute')}>
              This should not execute yet
            </Claude>
          </>
        )
      }

      return (
        <Claude onFinished={() => executionLog.push('end-phase-complete')}>
          <Phase name="end">Finishing up...</Phase>
        </Claude>
      )
    }

    await executePlan(<AgentWithHuman />, { mockMode: true })

    // Without onHumanPrompt, it auto-approves
    expect(executionLog).toContain('start-phase-complete')
    expect(executionLog).toContain('human-approved')
    expect(executionLog).toContain('end-phase-complete')
  })

  test('Human node with custom onHumanPrompt callback - approval', async () => {
    const executionLog: string[] = []
    let promptCalled = false
    let capturedMessage = ''
    let capturedContent = ''

    function AgentWithHuman() {
      const [phase, setPhase] = useState<'start' | 'review' | 'end'>('start')

      if (phase === 'start') {
        return (
          <Claude
            onFinished={() => {
              executionLog.push('start-phase-complete')
              setPhase('review')
            }}
          >
            <Phase name="start">Starting work...</Phase>
          </Claude>
        )
      }

      if (phase === 'review') {
        return (
          <Human
            message="Review required"
            onApprove={() => {
              executionLog.push('human-approved')
              setPhase('end')
            }}
          >
            Changes to review go here.
          </Human>
        )
      }

      return (
        <Claude onFinished={() => executionLog.push('end-phase-complete')}>
          <Phase name="end">Finishing up...</Phase>
        </Claude>
      )
    }

    await executePlan(<AgentWithHuman />, {
      mockMode: true,
      onHumanPrompt: async (message, content) => {
        promptCalled = true
        capturedMessage = message
        capturedContent = content
        return true // Approve
      },
    })

    expect(promptCalled).toBe(true)
    expect(capturedMessage).toBe('Review required')
    expect(capturedContent).toBe('Changes to review go here.')
    expect(executionLog).toContain('start-phase-complete')
    expect(executionLog).toContain('human-approved')
    expect(executionLog).toContain('end-phase-complete')
  })

  test('Human node with custom onHumanPrompt callback - rejection', async () => {
    const executionLog: string[] = []

    function AgentWithHuman() {
      const [phase, setPhase] = useState<'start' | 'review' | 'rejected'>('start')

      if (phase === 'start') {
        return (
          <Claude
            onFinished={() => {
              executionLog.push('start-phase-complete')
              setPhase('review')
            }}
          >
            <Phase name="start">Starting work...</Phase>
          </Claude>
        )
      }

      if (phase === 'review') {
        return (
          <Human
            message="Review required"
            onReject={() => {
              executionLog.push('human-rejected')
              setPhase('rejected')
            }}
          >
            Changes to review go here.
          </Human>
        )
      }

      return (
        <div>
          Execution halted or rejected
        </div>
      )
    }

    await executePlan(<AgentWithHuman />, {
      mockMode: true,
      onHumanPrompt: async () => {
        return false // Reject
      },
    })

    expect(executionLog).toContain('start-phase-complete')
    expect(executionLog).toContain('human-rejected')
    expect(executionLog).not.toContain('end-phase-complete')
  })

  test('Human node without callbacks halts on rejection', async () => {
    const executionLog: string[] = []

    function AgentWithHuman() {
      const [phase, setPhase] = useState<'start' | 'review' | 'halted'>('start')

      if (phase === 'start') {
        return (
          <Claude
            onFinished={() => {
              executionLog.push('phase1-complete')
              setPhase('review')
            }}
          >
            Phase 1
          </Claude>
        )
      }

      if (phase === 'review') {
        return (
          <>
            <Human message="Review required">
              This needs manual review
            </Human>
            <Claude onFinished={() => executionLog.push('phase2-complete')}>
              Phase 2 (should not execute if rejected)
            </Claude>
          </>
        )
      }

      return <div>Halted</div>
    }

    await executePlan(<AgentWithHuman />, {
      mockMode: true,
      onHumanPrompt: async () => false, // Reject
    })

    expect(executionLog).toContain('phase1-complete')
    expect(executionLog).not.toContain('phase2-complete')
  })

  test('Human node with default message', async () => {
    let capturedMessage = ''

    function AgentWithHuman() {
      const [approved, setApproved] = useState(false)

      if (!approved) {
        return (
          <Human onApprove={() => setApproved(true)}>
            Some content here
          </Human>
        )
      }

      return <div>Approved</div>
    }

    await executePlan(<AgentWithHuman />, {
      mockMode: true,
      onHumanPrompt: async (message) => {
        capturedMessage = message
        return true
      },
    })

    expect(capturedMessage).toBe('Human approval required to continue')
  })

  test('Multiple Human nodes are handled sequentially', async () => {
    const approvals: string[] = []

    function AgentWithMultipleReviews() {
      const [step, setStep] = useState(1)

      if (step === 1) {
        return (
          <Human
            message="First review"
            onApprove={() => {
              approvals.push('first')
              setStep(2)
            }}
          >
            First checkpoint
          </Human>
        )
      }

      if (step === 2) {
        return (
          <Human
            message="Second review"
            onApprove={() => {
              approvals.push('second')
              setStep(3)
            }}
          >
            Second checkpoint
          </Human>
        )
      }

      return <div>All approvals complete</div>
    }

    await executePlan(<AgentWithMultipleReviews />, {
      mockMode: true,
      onHumanPrompt: async () => true,
    })

    expect(approvals).toEqual(['first', 'second'])
  })

  test('Human node without onApprove callback does not cause infinite loop', async () => {
    let promptCount = 0
    const executionLog: string[] = []

    function AgentWithPersistentHuman() {
      // Human node stays in the tree but should only prompt once
      return (
        <>
          <Human message="One-time approval">
            This Human node has no onApprove callback, so it stays in the tree.
            But it should only prompt once.
          </Human>
          <Claude onFinished={() => executionLog.push('claude-executed')}>
            This should execute after Human approval
          </Claude>
        </>
      )
    }

    await executePlan(<AgentWithPersistentHuman />, {
      mockMode: true,
      onHumanPrompt: async () => {
        promptCount++
        return true
      },
    })

    // Should only prompt once, not loop infinitely
    expect(promptCount).toBe(1)
    expect(executionLog).toContain('claude-executed')
  })

  test('Multiple Human nodes without onApprove callbacks are all prompted', async () => {
    const prompts: string[] = []

    function AgentWithMultiplePersistentHumans() {
      // Two Human nodes, both stay in tree (no onApprove)
      // Both should be prompted in sequence
      return (
        <>
          <Human message="First checkpoint">
            First Human node stays in tree
          </Human>
          <Human message="Second checkpoint">
            Second Human node should still be prompted
          </Human>
          <Claude>Work to do</Claude>
        </>
      )
    }

    await executePlan(<AgentWithMultiplePersistentHumans />, {
      mockMode: true,
      onHumanPrompt: async (message) => {
        prompts.push(message)
        return true
      },
    })

    // Both Human nodes should be prompted
    expect(prompts).toHaveLength(2)
    expect(prompts).toContain('First checkpoint')
    expect(prompts).toContain('Second checkpoint')
  })
})

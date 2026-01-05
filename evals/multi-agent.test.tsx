import { describe, test, expect } from 'bun:test'
import { useState } from 'react'
import { renderPlan, executePlan, Claude, Phase, Step, Persona } from 'plue'

describe('multi-agent', () => {
  test('renders nested Claude components', async () => {
    function Architect({ task }: { task: string }) {
      return (
        <Claude>
          <Persona role="architect">Design systems.</Persona>
          <Phase name="plan">Break down: {task}</Phase>
        </Claude>
      )
    }

    function Developer({ subtask }: { subtask: string }) {
      return (
        <Claude>
          <Persona role="developer">Write code.</Persona>
          <Phase name="implement">Implement: {subtask}</Phase>
        </Claude>
      )
    }

    function Team() {
      return (
        <>
          <Architect task="Build auth system" />
          <Developer subtask="Create login form" />
        </>
      )
    }

    const plan = await renderPlan(<Team />)

    expect(plan).toContain('role="architect"')
    expect(plan).toContain('role="developer"')
    expect(plan).toContain('Build auth system')
    expect(plan).toContain('Create login form')
  })

  test('agent orchestration with state coordination', async () => {
    const executionOrder: string[] = []

    function Architect({ onPlan }: { onPlan: (plan: any) => void }) {
      return (
        <Claude
          onFinished={(output) => {
            executionOrder.push('architect')
            onPlan(output)
          }}
        >
          <Persona role="architect" />
          Return a plan with subtasks.
        </Claude>
      )
    }

    function Developer({ subtask, onComplete }: { subtask: string; onComplete: () => void }) {
      return (
        <Claude
          onFinished={() => {
            executionOrder.push(`developer:${subtask}`)
            onComplete()
          }}
        >
          <Persona role="developer" />
          Implement: {subtask}
        </Claude>
      )
    }

    function DevTeam() {
      const [stage, setStage] = useState<'planning' | 'implementing' | 'done'>('planning')
      const [subtasks, setSubtasks] = useState<string[]>([])
      const [completed, setCompleted] = useState<string[]>([])

      if (stage === 'planning') {
        return (
          <Architect
            onPlan={(plan) => {
              setSubtasks(plan.subtasks || ['task1', 'task2'])
              setStage('implementing')
            }}
          />
        )
      }

      if (stage === 'implementing') {
        const remaining = subtasks.filter((t) => !completed.includes(t))
        if (remaining.length === 0) {
          setStage('done')
          return null
        }

        return (
          <Developer
            subtask={remaining[0]}
            onComplete={() => setCompleted([...completed, remaining[0]])}
          />
        )
      }

      return null
    }

    await executePlan(<DevTeam />)

    expect(executionOrder[0]).toBe('architect')
    expect(executionOrder).toContain('developer:task1')
    expect(executionOrder).toContain('developer:task2')
  })

  test('sub-agents can be spawned dynamically', async () => {
    const spawnedAgents: string[] = []

    function SubAgent({ id }: { id: string }) {
      return (
        <Claude
          onFinished={() => spawnedAgents.push(id)}
        >
          Sub-agent {id} executing.
        </Claude>
      )
    }

    function Orchestrator() {
      const [agents] = useState(['a', 'b', 'c'])

      return (
        <>
          {agents.map((id) => (
            <SubAgent key={id} id={id} />
          ))}
        </>
      )
    }

    await executePlan(<Orchestrator />)

    expect(spawnedAgents).toContain('a')
    expect(spawnedAgents).toContain('b')
    expect(spawnedAgents).toContain('c')
  })
})

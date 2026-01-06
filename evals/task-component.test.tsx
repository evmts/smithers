import { describe, test, expect } from 'bun:test'
import './setup.ts'
import { renderPlan, Claude, Phase, Step, Task } from '../src/index.js'

/**
 * Tests for the Task component - trackable task with completion state.
 *
 * The Task component allows marking individual tasks as done/pending,
 * which is useful for tracking progress through a workflow.
 */
describe('Task component', () => {
  test('renders Task component with done=false', async () => {
    function TaskAgent() {
      return (
        <Claude>
          <Phase name="work">
            <Task done={false}>Research the topic</Task>
            <Task done={false}>Write the outline</Task>
          </Phase>
        </Claude>
      )
    }

    const plan = await renderPlan(<TaskAgent />)

    expect(plan).toContain('<task')
    expect(plan).toContain('done="false"')
    expect(plan).toContain('Research the topic')
    expect(plan).toContain('Write the outline')
  })

  test('renders Task component with done=true', async () => {
    function TaskAgent() {
      return (
        <Claude>
          <Phase name="work">
            <Task done={true}>Completed task</Task>
            <Task done={false}>Pending task</Task>
          </Phase>
        </Claude>
      )
    }

    const plan = await renderPlan(<TaskAgent />)

    expect(plan).toContain('done="true"')
    expect(plan).toContain('done="false"')
    expect(plan).toContain('Completed task')
    expect(plan).toContain('Pending task')
  })

  test('renders Task component without done prop (defaults to undefined)', async () => {
    function TaskAgent() {
      return (
        <Claude>
          <Task>Task without done prop</Task>
        </Claude>
      )
    }

    const plan = await renderPlan(<TaskAgent />)

    expect(plan).toContain('<task')
    expect(plan).toContain('Task without done prop')
    // done prop should not appear if not specified
    expect(plan).not.toContain('done=')
  })

  test('Task components inside Phase and Step', async () => {
    function TaskAgent() {
      return (
        <Claude>
          <Phase name="implementation">
            <Step>
              <Task done={false}>Subtask 1</Task>
              <Task done={true}>Subtask 2</Task>
            </Step>
          </Phase>
        </Claude>
      )
    }

    const plan = await renderPlan(<TaskAgent />)

    expect(plan).toContain('<phase name="implementation">')
    expect(plan).toContain('<step>')
    expect(plan).toContain('<task done="false">')
    expect(plan).toContain('<task done="true">')
  })

  test('dynamically updates Task done state', async () => {
    function DynamicTaskAgent({ completedTasks }: { completedTasks: string[] }) {
      const tasks = ['task1', 'task2', 'task3']

      return (
        <Claude>
          <Phase name="checklist">
            {tasks.map((task) => (
              <Task key={task} done={completedTasks.includes(task)}>
                {task}
              </Task>
            ))}
          </Phase>
        </Claude>
      )
    }

    const noneComplete = await renderPlan(<DynamicTaskAgent completedTasks={[]} />)
    expect(noneComplete).toContain('done="false"')
    expect(noneComplete).not.toContain('done="true"')

    const oneComplete = await renderPlan(<DynamicTaskAgent completedTasks={['task1']} />)
    expect(oneComplete).toContain('done="true"')
    expect(oneComplete).toContain('done="false"')

    const allComplete = await renderPlan(
      <DynamicTaskAgent completedTasks={['task1', 'task2', 'task3']} />
    )
    expect(allComplete).toContain('done="true"')
    expect(allComplete).not.toContain('done="false"')
  })

  test('Task with complex children', async () => {
    function ComplexTaskAgent() {
      return (
        <Claude>
          <Task done={false}>
            Implement feature X with the following requirements:
            - Support for multiple formats
            - Error handling
            - Unit tests
          </Task>
        </Claude>
      )
    }

    const plan = await renderPlan(<ComplexTaskAgent />)

    expect(plan).toContain('<task done="false">')
    expect(plan).toContain('Implement feature X')
    expect(plan).toContain('Support for multiple formats')
  })
})

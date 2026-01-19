import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import type { SmithersDB } from '../db/index.js'
import { createSmithersDB } from '../db/index.js'
import type { SmithersRoot } from '../reconciler/root.js'
import { createSmithersRoot } from '../reconciler/root.js'
import { SmithersProvider } from '../components/SmithersProvider.js'
import { Phase } from '../components/Phase.js'
import { Step } from '../components/Step.js'
import { usePlan } from './usePlan.js'

interface TestContext {
  db: SmithersDB
  executionId: string
  root: SmithersRoot
}

async function createTestContext(): Promise<TestContext> {
  const db = createSmithersDB({ reset: true })
  const executionId = db.execution.start('test-use-plan', 'test.tsx')
  const root = createSmithersRoot()
  return { db, executionId, root }
}

function cleanupTestContext(ctx: TestContext): void {
  ctx.root.dispose()
  setTimeout(() => {
    try { ctx.db.close() } catch {}
  }, 10)
}

function PlanConsumer(props: { onPlan: (plan: string, activeNodeId: string | null) => void }) {
  const { plan, activeNodeId } = usePlan()
  props.onPlan(plan, activeNodeId)
  return null
}

describe('usePlan', () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await createTestContext()
  })

  afterEach(() => {
    cleanupTestContext(ctx)
  })

  test('returns plan XML with active node marker', async () => {
    let capturedPlan = ''
    let capturedActive: string | null = null

    await ctx.root.render(
      <SmithersProvider
        db={ctx.db}
        executionId={ctx.executionId}
        getTreeXML={() => ctx.root.toXML()}
        stopped={true}
      >
        <Phase name="plan-phase">
          <Step name="plan-step">
            <PlanConsumer onPlan={(plan, activeNodeId) => {
              capturedPlan = plan
              capturedActive = activeNodeId
            }} />
          </Step>
        </Phase>
      </SmithersProvider>
    )

    await new Promise(resolve => setTimeout(resolve, 100))

    expect(capturedPlan).toContain('<step')
    expect(capturedActive).not.toBeNull()
    expect(capturedPlan).toContain(`plan-node-id="${capturedActive}"`)
    expect(capturedPlan).toContain('plan-active="true"')
  })
})

// useAgentHooks.test.tsx - Basic hook wiring tests for agent hooks
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { createSmithersRoot, type SmithersRoot } from '../reconciler/root.js'
import { SmithersProvider } from '../components/SmithersProvider.js'
import { ExecutionScopeProvider } from '../components/ExecutionScope.js'
import { useClaude, type UseClaudeResult } from './useClaude.js'
import { useCodex, type UseCodexResult } from './useCodex.js'
import { useAmp, type UseAmpResult } from './useAmp.js'
import { useSmithersSubagent, type UseSmithersSubagentResult } from './useSmithersSubagent.js'
import { useReview, type UseReviewResult } from './useReview.js'

interface TestContext {
  db: SmithersDB
  executionId: string
  root: SmithersRoot
}

async function createTestContext(): Promise<TestContext> {
  const db = createSmithersDB({ reset: true })
  const executionId = db.execution.start('test-agent-hooks', 'test.tsx')
  const root = createSmithersRoot()
  return { db, executionId, root }
}

function cleanupTestContext(ctx: TestContext): void {
  ctx.root.dispose()
  setTimeout(() => {
    try { ctx.db.close() } catch {}
  }, 10)
}

function withProviders(ctx: TestContext, children: React.ReactNode) {
  return (
    <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
      <ExecutionScopeProvider enabled={false}>
        {children}
      </ExecutionScopeProvider>
    </SmithersProvider>
  )
}

function ClaudeHarness({ onResult }: { onResult: (r: UseClaudeResult) => void }) {
  const result = useClaude({ children: 'test' })
  onResult(result)
  return <test-component status={result.status} />
}

function CodexHarness({ onResult }: { onResult: (r: UseCodexResult) => void }) {
  const result = useCodex({ children: 'test' })
  onResult(result)
  return <test-component status={result.status} />
}

function AmpHarness({ onResult }: { onResult: (r: UseAmpResult) => void }) {
  const result = useAmp({ children: 'test' })
  onResult(result)
  return <test-component status={result.status} />
}

function SmithersHarness({ onResult }: { onResult: (r: UseSmithersSubagentResult) => void }) {
  const result = useSmithersSubagent({ children: 'test' })
  onResult(result)
  return <test-component status={result.status} />
}

function ReviewHarness({ onResult }: { onResult: (r: UseReviewResult) => void }) {
  const result = useReview({ target: { type: 'diff', ref: 'main' } })
  onResult(result)
  return <test-component status={result.status} />
}

describe('agent hooks', () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await createTestContext()
  })

  afterEach(() => {
    cleanupTestContext(ctx)
  })

  test('useClaude returns pending state without execution', async () => {
    let captured: UseClaudeResult | null = null
    await ctx.root.render(withProviders(ctx, <ClaudeHarness onResult={(r) => { captured = r }} />))
    await new Promise(r => setTimeout(r, 50))
    expect(captured).not.toBeNull()
    expect(captured!.status).toBe('pending')
    expect(captured!.agentId).toBeNull()
    expect(captured!.model).toBe('sonnet')
    expect(captured!.executionId).toBe(ctx.executionId)
    expect(Array.isArray(captured!.tailLog)).toBe(true)
  })

  test('useCodex returns pending state without execution', async () => {
    let captured: UseCodexResult | null = null
    await ctx.root.render(withProviders(ctx, <CodexHarness onResult={(r) => { captured = r }} />))
    await new Promise(r => setTimeout(r, 50))
    expect(captured).not.toBeNull()
    expect(captured!.status).toBe('pending')
    expect(captured!.agentId).toBeNull()
    expect(captured!.model).toBe('o4-mini')
    expect(captured!.executionId).toBe(ctx.executionId)
    expect(Array.isArray(captured!.tailLog)).toBe(true)
  })

  test('useAmp returns pending state without execution', async () => {
    let captured: UseAmpResult | null = null
    await ctx.root.render(withProviders(ctx, <AmpHarness onResult={(r) => { captured = r }} />))
    await new Promise(r => setTimeout(r, 50))
    expect(captured).not.toBeNull()
    expect(captured!.status).toBe('pending')
    expect(captured!.agentId).toBeNull()
    expect(captured!.mode).toBe('smart')
    expect(captured!.executionId).toBe(ctx.executionId)
    expect(Array.isArray(captured!.tailLog)).toBe(true)
  })

  test('useSmithersSubagent returns pending state without execution', async () => {
    let captured: UseSmithersSubagentResult | null = null
    await ctx.root.render(withProviders(ctx, <SmithersHarness onResult={(r) => { captured = r }} />))
    await new Promise(r => setTimeout(r, 50))
    expect(captured).not.toBeNull()
    expect(captured!.status).toBe('pending')
    expect(captured!.subagentId).toBeNull()
    expect(captured!.plannerModel).toBe('sonnet')
    expect(captured!.executionModel).toBe('sonnet')
    expect(captured!.executionId).toBe(ctx.executionId)
  })

  test('useReview returns pending state without execution', async () => {
    let captured: UseReviewResult | null = null
    await ctx.root.render(withProviders(ctx, <ReviewHarness onResult={(r) => { captured = r }} />))
    await new Promise(r => setTimeout(r, 50))
    expect(captured).not.toBeNull()
    expect(captured!.status).toBe('pending')
    expect(captured!.result).toBeNull()
    expect(captured!.error).toBeNull()
  })
})

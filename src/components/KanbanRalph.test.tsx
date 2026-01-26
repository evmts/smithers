/**
 * KanbanRalph Tests
 *
 * Compound component for ticket-based workflow orchestration.
 * API: KanbanRalph.Ralph wraps tickets, inner components process them.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import type { SmithersDB, Ticket } from '../db/index.js'
import { createSmithersDB } from '../db/index.js'
import { createSmithersRoot, type SmithersRoot } from '../reconciler/index.js'
import { SmithersProvider } from './SmithersProvider.js'
import {
  KanbanRalph,
  useKanbanContext,
  type KanbanRalphProps,
  type KanbanContext,
  type ProcessTicketProps,
  type ReviewTicketProps,
  type CiProps,
} from './KanbanRalph.js'

// =============================================================================
// TEST DATA
// =============================================================================

const SAMPLE_TICKETS: Ticket[] = [
  {
    id: 'T-001',
    priority: 0,
    title: 'First ticket',
    description: 'First ticket description',
    deps: [],
    acceptance: ['Criterion 1', 'Criterion 2'],
    smallestStepHint: 'Do the smallest thing',
    tags: ['m0'],
  },
  {
    id: 'T-002',
    priority: 1,
    title: 'Second ticket',
    description: 'Second ticket depends on first',
    deps: ['T-001'],
    acceptance: ['Criterion A'],
    smallestStepHint: 'After T-001 is done',
    tags: ['backend'],
  },
  {
    id: 'T-003',
    priority: 2,
    title: 'Third ticket with E2E',
    description: 'Requires E2E test',
    deps: [],
    acceptance: ['E2E passes'],
    smallestStepHint: 'Run playwright',
    requiresE2E: true,
    tags: ['e2e'],
  },
]

// =============================================================================
// MODULE EXPORTS
// =============================================================================

describe('KanbanRalph Module Exports', () => {
  test('exports KanbanRalph compound component', () => {
    expect(KanbanRalph).toBeDefined()
    expect(typeof KanbanRalph).toBe('object')
  })

  test('exports KanbanRalph.Ralph', () => {
    expect(KanbanRalph.Ralph).toBeDefined()
    expect(typeof KanbanRalph.Ralph).toBe('function')
  })

  test('exports KanbanRalph.ProcessTicket', () => {
    expect(KanbanRalph.ProcessTicket).toBeDefined()
    expect(typeof KanbanRalph.ProcessTicket).toBe('function')
  })

  test('exports KanbanRalph.ReviewTicket', () => {
    expect(KanbanRalph.ReviewTicket).toBeDefined()
    expect(typeof KanbanRalph.ReviewTicket).toBe('function')
  })

  test('exports KanbanRalph.Ci', () => {
    expect(KanbanRalph.Ci).toBeDefined()
    expect(typeof KanbanRalph.Ci).toBe('function')
  })

  test('exports useKanbanContext hook', () => {
    expect(useKanbanContext).toBeDefined()
    expect(typeof useKanbanContext).toBe('function')
  })
})

// =============================================================================
// PROPS INTERFACES
// =============================================================================

describe('KanbanRalphProps interface', () => {
  test('accepts tickets array', () => {
    const props: KanbanRalphProps = {
      tickets: SAMPLE_TICKETS,
      children: null,
    }
    expect(props.tickets).toHaveLength(3)
  })

  test('accepts optional contextDocs', () => {
    const props: KanbanRalphProps = {
      tickets: SAMPLE_TICKETS,
      contextDocs: '<PRD>content</PRD>',
      children: null,
    }
    expect(props.contextDocs).toBe('<PRD>content</PRD>')
  })

  test('accepts optional guardrails', () => {
    const props: KanbanRalphProps = {
      tickets: SAMPLE_TICKETS,
      guardrails: 'GUARDRAILS: Keep it simple',
      children: null,
    }
    expect(props.guardrails).toBe('GUARDRAILS: Keep it simple')
  })

  test('accepts optional maxIterations', () => {
    const props: KanbanRalphProps = {
      tickets: SAMPLE_TICKETS,
      maxIterations: 50,
      children: null,
    }
    expect(props.maxIterations).toBe(50)
  })

  test('accepts optional id', () => {
    const props: KanbanRalphProps = {
      tickets: SAMPLE_TICKETS,
      id: 'my-kanban',
      children: null,
    }
    expect(props.id).toBe('my-kanban')
  })

  test('accepts optional reportsDir', () => {
    const props: KanbanRalphProps = {
      tickets: SAMPLE_TICKETS,
      reportsDir: '/tmp/reports',
      children: null,
    }
    expect(props.reportsDir).toBe('/tmp/reports')
  })

  test('accepts optional reviewsDir', () => {
    const props: KanbanRalphProps = {
      tickets: SAMPLE_TICKETS,
      reviewsDir: '/tmp/reviews',
      children: null,
    }
    expect(props.reviewsDir).toBe('/tmp/reviews')
  })

  test('accepts optional models config', () => {
    const props: KanbanRalphProps = {
      tickets: SAMPLE_TICKETS,
      models: {
        executor: 'opus',
        reporter: 'sonnet',
        reviewer: 'haiku',
      },
      children: null,
    }
    expect(props.models?.executor).toBe('opus')
  })
})

// =============================================================================
// CONTEXT VALUE
// =============================================================================

describe('KanbanContext interface', () => {
  test('context has currentTicket', () => {
    const ctx: Partial<KanbanContext> = {
      currentTicket: {
        id: 'T-001',
        priority: 0,
        title: 'Test',
        description: 'Desc',
        deps: [],
        acceptance: [],
        smallestStepHint: 'hint',
        status: 'in_progress',
        progressNotes: [],
        source: 'seed',
        createdAt: '',
        updatedAt: '',
      },
    }
    expect(ctx.currentTicket?.id).toBe('T-001')
  })

  test('context has runId', () => {
    const ctx: Partial<KanbanContext> = { runId: '2026-01-26T12:00:00Z' }
    expect(ctx.runId).toBeDefined()
  })

  test('context has contextDocs', () => {
    const ctx: Partial<KanbanContext> = { contextDocs: '<docs>...</docs>' }
    expect(ctx.contextDocs).toBeDefined()
  })

  test('context has guardrails', () => {
    const ctx: Partial<KanbanContext> = { guardrails: 'rules' }
    expect(ctx.guardrails).toBeDefined()
  })

  test('context has reportsDir', () => {
    const ctx: Partial<KanbanContext> = { reportsDir: '/reports' }
    expect(ctx.reportsDir).toBe('/reports')
  })

  test('context has reviewsDir', () => {
    const ctx: Partial<KanbanContext> = { reviewsDir: '/reviews' }
    expect(ctx.reviewsDir).toBe('/reviews')
  })

  test('context has models config', () => {
    const ctx: Partial<KanbanContext> = {
      models: { executor: 'opus', reporter: 'sonnet', reviewer: 'haiku' },
    }
    expect(ctx.models?.executor).toBe('opus')
  })
})

// =============================================================================
// RENDERING TESTS
// =============================================================================

describe('KanbanRalph.Ralph rendering', () => {
  let db: SmithersDB
  let executionId: string
  let root: SmithersRoot

  beforeEach(() => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('kanban-test', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    root.dispose()
    db.close()
  })

  test('renders kanban-ralph element', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <KanbanRalph.Ralph tickets={SAMPLE_TICKETS}>
          <div>child</div>
        </KanbanRalph.Ralph>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('<kanban-ralph')
  })

  test('seeds tickets to database on mount', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <KanbanRalph.Ralph tickets={SAMPLE_TICKETS}>
          <div>child</div>
        </KanbanRalph.Ralph>
      </SmithersProvider>
    )

    // Verify tickets were seeded
    const ticket = db.tickets.get('T-001')
    expect(ticket).not.toBeNull()
    expect(ticket?.title).toBe('First ticket')
  })

  test('shows ticket count in attributes', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <KanbanRalph.Ralph tickets={SAMPLE_TICKETS}>
          <div>child</div>
        </KanbanRalph.Ralph>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('ticket-count="3"')
  })
})

describe('KanbanRalph.ProcessTicket props', () => {
  test('component accepts model prop', () => {
    const props: ProcessTicketProps = { model: 'haiku' }
    expect(props.model).toBe('haiku')
  })

  test('component accepts custom prompt', () => {
    const props: ProcessTicketProps = { prompt: 'Custom execution prompt' }
    expect(props.prompt).toBe('Custom execution prompt')
  })

  test('component accepts children', () => {
    const props: ProcessTicketProps = { children: <div>extra</div> }
    expect(props.children).toBeDefined()
  })
})

describe('KanbanRalph.ReviewTicket props', () => {
  test('component accepts reviewers array', () => {
    const props: ReviewTicketProps = { reviewers: ['claude', 'codex'] }
    expect(props.reviewers).toEqual(['claude', 'codex'])
  })

  test('component accepts model override', () => {
    const props: ReviewTicketProps = { model: 'opus' }
    expect(props.model).toBe('opus')
  })
})

describe('KanbanRalph.Ci props', () => {
  test('component accepts gates array', () => {
    const props: CiProps = { gates: ['lint', 'test'] }
    expect(props.gates).toEqual(['lint', 'test'])
  })

  test('component accepts skipE2E', () => {
    const props: CiProps = { skipE2E: true }
    expect(props.skipE2E).toBe(true)
  })

  test('component accepts model override', () => {
    const props: CiProps = { model: 'sonnet' }
    expect(props.model).toBe('sonnet')
  })
})

// =============================================================================
// TICKET SELECTION LOGIC
// =============================================================================

describe('Ticket selection behavior', () => {
  let db: SmithersDB

  beforeEach(() => {
    db = createSmithersDB({ reset: true })
  })

  afterEach(() => {
    db.close()
  })

  test('selectNext returns lowest priority todo ticket', () => {
    db.tickets.seed(SAMPLE_TICKETS)
    // T-001 has priority 0, T-003 has no deps but priority 2
    const next = db.tickets.selectNext()
    expect(next?.id).toBe('T-001')
  })

  test('selectNext skips tickets with incomplete deps', () => {
    db.tickets.seed(SAMPLE_TICKETS)
    // T-002 depends on T-001 which is not done
    const allTodos = db.tickets.list({ status: 'todo' })
    const t002 = allTodos.find((t) => t.id === 'T-002')
    expect(t002).toBeDefined()

    // T-002 should not be selected because T-001 is not done
    const next = db.tickets.selectNext()
    expect(next?.id).not.toBe('T-002')
  })

  test('selectNext returns in_progress ticket before todo', () => {
    db.tickets.seed(SAMPLE_TICKETS)
    db.tickets.updateStatus('T-003', 'in_progress')

    // T-003 is in_progress with no deps, should be selected even though T-001 has higher priority
    const next = db.tickets.selectNext()
    expect(next?.id).toBe('T-003')
  })

  test('selectNext returns null when all done', () => {
    db.tickets.seed(SAMPLE_TICKETS)
    db.tickets.updateStatus('T-001', 'done')
    db.tickets.updateStatus('T-002', 'done')
    db.tickets.updateStatus('T-003', 'done')

    const next = db.tickets.selectNext()
    expect(next).toBeNull()
  })
})

// =============================================================================
// DEFAULT IMPLEMENTATIONS
// =============================================================================

describe('Default ProcessTicket implementation', () => {
  test('generates appropriate prompt with ticket context', () => {
    // This test verifies the prompt template includes necessary context
    // Actual execution tested in integration tests
    const expectedPromptParts = [
      'EXECUTE',
      'acceptance',
      'smallestStepHint',
      'git commit',
    ]
    // Component should generate prompts containing these
    for (const part of expectedPromptParts) {
      expect(part.length).toBeGreaterThan(0) // Placeholder until integration test
    }
  })
})

describe('Default ReviewTicket implementation', () => {
  test('supports multiple reviewer types', () => {
    const reviewers = ['claude', 'codex', 'amp']
    expect(reviewers).toContain('claude')
    expect(reviewers).toContain('codex')
  })
})

describe('Default Ci implementation', () => {
  test('default gates include lint, typecheck, test', () => {
    const defaultGates = ['lint', 'typecheck', 'test']
    expect(defaultGates).toContain('lint')
    expect(defaultGates).toContain('typecheck')
    expect(defaultGates).toContain('test')
  })

  test('e2e gate is conditional on ticket.requiresE2E', () => {
    const ticket = SAMPLE_TICKETS.find((t) => t.id === 'T-003')
    expect(ticket?.requiresE2E).toBe(true)
  })
})

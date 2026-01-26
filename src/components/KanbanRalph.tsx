/**
 * KanbanRalph - Compound component for ticket-based workflow orchestration
 *
 * API:
 *   <KanbanRalph.Ralph tickets={[...]} contextDocs="..." guardrails="...">
 *     <KanbanRalph.ProcessTicket />
 *     <KanbanRalph.Ci />
 *     <KanbanRalph.ReviewTicket />
 *   </KanbanRalph.Ralph>
 *
 * Context is shared between Ralph and all inner components.
 */
import {
  createContext,
  useContext,
  useRef,
  type ReactNode,
} from 'react'
import type { Ticket, TicketWithState } from '../db/index.js'
import { useSmithers } from './SmithersProvider.js'
import { Ralph } from './Ralph.js'
import { Step } from './Step.js'
import { Claude } from './Claude.js'
import { createDebugLogger } from '../utils/debug.js'

const log = createDebugLogger('KanbanRalph')

// =============================================================================
// TYPES
// =============================================================================

export type ModelConfig = {
  executor?: 'opus' | 'sonnet' | 'haiku'
  reporter?: 'opus' | 'sonnet' | 'haiku'
  reviewer?: 'opus' | 'sonnet' | 'haiku'
}

export interface KanbanRalphProps {
  /** Tickets to process */
  tickets: Ticket[]
  /** Context documents (PRD, DESIGN, ENGINEERING) as XML string */
  contextDocs?: string
  /** Guardrails/rules for execution */
  guardrails?: string
  /** Maximum iterations before stopping */
  maxIterations?: number
  /** Unique ID for this kanban instance */
  id?: string
  /** Directory for reports */
  reportsDir?: string
  /** Directory for reviews */
  reviewsDir?: string
  /** Model configuration */
  models?: ModelConfig
  /** Children (ProcessTicket, Ci, ReviewTicket, etc.) */
  children: ReactNode
}

export interface ProcessTicketProps {
  /** Override model for execution */
  model?: 'opus' | 'sonnet' | 'haiku'
  /** Custom prompt template (receives context) */
  prompt?: string
  /** Children to render inside the step */
  children?: ReactNode
}

export interface ReviewTicketProps {
  /** Which reviewers to use */
  reviewers?: ('claude' | 'codex' | 'amp')[]
  /** Override model */
  model?: 'opus' | 'sonnet' | 'haiku'
  /** Children to render */
  children?: ReactNode
}

export interface CiProps {
  /** Which CI gates to run */
  gates?: ('lint' | 'typecheck' | 'test' | 'e2e')[]
  /** Skip E2E even if ticket requires it */
  skipE2E?: boolean
  /** Override model */
  model?: 'opus' | 'sonnet' | 'haiku'
  /** Children to render */
  children?: ReactNode
}

export interface KanbanContext {
  /** Get current ticket being processed (getter to ensure fresh value) */
  getCurrentTicket: () => TicketWithState | null
  /** Get current run ID (getter to ensure fresh value) */
  getRunId: () => string
  /** Context documents */
  contextDocs: string
  /** Guardrails */
  guardrails: string
  /** Reports directory */
  reportsDir: string
  /** Reviews directory */
  reviewsDir: string
  /** Model configuration */
  models: ModelConfig
  /** Select next ticket */
  selectNextTicket: () => TicketWithState | null
  /** Update current ticket status */
  updateTicketStatus: (status: 'todo' | 'in_progress' | 'blocked' | 'done', reason?: string) => void
  /** Add progress note to current ticket */
  addProgressNote: (note: string) => void
}

// =============================================================================
// CONTEXT
// =============================================================================

const KanbanContextInternal = createContext<KanbanContext | null>(null)

export function useKanbanContext(): KanbanContext {
  const ctx = useContext(KanbanContextInternal)
  if (!ctx) {
    throw new Error('useKanbanContext must be used within KanbanRalph.Ralph')
  }
  return ctx
}

// Try to get context, returns null if not in KanbanRalph
function useKanbanContextOptional(): KanbanContext | null {
  return useContext(KanbanContextInternal)
}

// =============================================================================
// DEFAULT PROMPTS
// =============================================================================

function getProcessTicketPrompt(ctx: KanbanContext): string {
  const ticket = ctx.getCurrentTicket()
  const runId = ctx.getRunId()

  log.debug('getProcessTicketPrompt called', { ticketId: ticket?.id, runId })

  if (!ticket) {
    log.warn('No ticket selected for process prompt')
    return 'No ticket selected.'
  }

  return `
${ctx.guardrails}

<context>
${ctx.contextDocs}
</context>

EXECUTE TICKET: ${ticket.id}
Title: ${ticket.title}
Description: ${ticket.description}

ACCEPTANCE CRITERIA:
${ticket.acceptance.map((a, i) => `${i + 1}. ${a}`).join('\n')}

SMALLEST STEP HINT: ${ticket.smallestStepHint}

${ticket.relevantFiles?.length ? `RELEVANT FILES:\n${ticket.relevantFiles.map((f) => `- ${f}`).join('\n')}` : ''}

INSTRUCTIONS:
1. Implement the smallestStepHint
2. Add/update tests for touched behavior
3. Commit: git add -A && git commit -m "${ticket.id}: <brief description>"
4. Write report to ${ctx.reportsDir}/${runId}_EXECUTION.md
`
}

function getCiPrompt(ctx: KanbanContext, gates: string[]): string {
  const ticket = ctx.getCurrentTicket()
  const runId = ctx.getRunId()

  log.debug('getCiPrompt called', { ticketId: ticket?.id, runId, gates })

  if (!ticket) {
    log.warn('No ticket selected for CI prompt')
  }

  return `
CI GATES FOR: ${ticket?.id ?? 'unknown'}

Run the following CI gates in order. Fix failures before proceeding.

GATES: ${gates.join(', ')}

For each gate:
1. Check if script exists in package.json
2. Run it: bun run <script>
3. Fix any failures
4. Log SKIPPED if script missing

${ticket?.requiresE2E ? 'E2E REQUIRED: Run playwright tests against docker compose stack.' : 'E2E: Skip (not required for this ticket)'}

Commit fixes: git add -A && git commit -m "${ticket?.id ?? 'unknown'}: fix CI"
Write report to ${ctx.reportsDir}/${runId}_CI.md
`
}

function getReviewPrompt(ctx: KanbanContext): string {
  const ticket = ctx.getCurrentTicket()
  const runId = ctx.getRunId()

  log.debug('getReviewPrompt called', { ticketId: ticket?.id, runId })

  if (!ticket) {
    log.warn('No ticket selected for review prompt')
  }

  return `
${ctx.guardrails}

<context>
${ctx.contextDocs}
</context>

CODE REVIEW FOR: ${ticket?.id ?? 'unknown'}

Review against PRD/DESIGN/ENGINEERING specs.
Focus: correctness, patterns, type safety, architecture adherence.

Severity tag findings: CRITICAL / IMPORTANT / NICE

CRITICAL items must be fixed before proceeding.

Write report to ${ctx.reviewsDir}/${runId}/REVIEW.md
`
}

// =============================================================================
// COMPOUND COMPONENTS
// =============================================================================

function KanbanRalphRoot(props: KanbanRalphProps): ReactNode {
  const {
    tickets,
    contextDocs = '',
    guardrails = '',
    maxIterations = 100,
    id = 'kanban-ralph',
    reportsDir = 'reports',
    reviewsDir = 'reviews',
    models = {},
    children,
  } = props

  log.info('KanbanRalphRoot initializing', { ticketCount: tickets.length, id, maxIterations })

  const { db } = useSmithers()
  const hasSeededRef = useRef(false)
  const currentTicketRef = useRef<TicketWithState | null>(null)
  const runIdRef = useRef(new Date().toISOString())

  // Seed tickets synchronously on first render (non-destructive INSERT OR IGNORE)
  if (!hasSeededRef.current) {
    log.info(`Seeding ${tickets.length} tickets`)
    db.tickets.seed(tickets)
    hasSeededRef.current = true
    log.info('Seeding complete')

    // Select first ticket immediately after seeding so it's available for initial render
    const firstTicket = db.tickets.selectNext()
    if (firstTicket) {
      currentTicketRef.current = firstTicket
      runIdRef.current = new Date().toISOString()
      if (firstTicket.status === 'todo') {
        db.tickets.updateStatus(firstTicket.id, 'in_progress')
      }
      log.info('Initial ticket selected', { ticketId: firstTicket.id, runId: runIdRef.current })
    } else {
      log.warn('No tickets available after seeding')
    }
  }

  // Select next ticket
  const selectNextTicket = (): TicketWithState | null => {
    log.enter('selectNextTicket')
    const next = db.tickets.selectNext()
    const prevTicket = currentTicketRef.current
    currentTicketRef.current = next
    if (next && next.status === 'todo') {
      log.debug(`Updating ticket ${next.id} status to in_progress`)
      db.tickets.updateStatus(next.id, 'in_progress')
    }
    runIdRef.current = new Date().toISOString()
    log.exit('selectNextTicket', {
      prevTicketId: prevTicket?.id,
      newTicketId: next?.id,
      newRunId: runIdRef.current,
    })
    return next
  }

  // Update current ticket status
  const updateTicketStatus = (status: 'todo' | 'in_progress' | 'blocked' | 'done', reason?: string) => {
    const ticketId = currentTicketRef.current?.id
    log.enter('updateTicketStatus', { ticketId, status, reason })
    if (currentTicketRef.current) {
      db.tickets.updateStatus(currentTicketRef.current.id, status, reason)
      log.info(`Ticket ${ticketId} status updated to ${status}`)
    } else {
      log.warn('updateTicketStatus called with no current ticket')
    }
    log.exit('updateTicketStatus')
  }

  // Add progress note
  const addProgressNote = (note: string) => {
    const ticketId = currentTicketRef.current?.id
    log.enter('addProgressNote', { ticketId, noteLength: note.length })
    if (currentTicketRef.current) {
      db.tickets.addProgressNote(currentTicketRef.current.id, note)
      log.debug(`Added progress note to ticket ${ticketId}`)
    } else {
      log.warn('addProgressNote called with no current ticket')
    }
    log.exit('addProgressNote')
  }

  // Condition: continue while tickets remain
  const hasTicketsRemaining = (): boolean => {
    const result = db.tickets.selectNext() !== null
    log.debug('hasTicketsRemaining check', { result })
    return result
  }

  // Getter functions to ensure we always get fresh values from refs
  const getCurrentTicket = (): TicketWithState | null => {
    const ticket = currentTicketRef.current
    log.debug('getCurrentTicket called', { ticketId: ticket?.id })
    return ticket
  }

  const getRunId = (): string => {
    return runIdRef.current
  }

  const contextValue: KanbanContext = {
    getCurrentTicket,
    getRunId,
    contextDocs,
    guardrails,
    reportsDir,
    reviewsDir,
    models: {
      executor: models.executor ?? 'opus',
      reporter: models.reporter ?? 'sonnet',
      reviewer: models.reviewer ?? 'sonnet',
    },
    selectNextTicket,
    updateTicketStatus,
    addProgressNote,
  }

  return (
    <kanban-ralph id={id} ticket-count={String(tickets.length)}>
      <KanbanContextInternal.Provider value={contextValue}>
        <Ralph id={id} maxIterations={maxIterations} condition={hasTicketsRemaining}>
          {/* Select ticket at start of each iteration */}
          <Step name={`${id}-select`}>
            <Claude model={contextValue.models.reporter ?? 'sonnet'} permissionMode="bypassPermissions">
              {`
SELECT NEXT TICKET

1. Use db.tickets.selectNext() to get next eligible ticket
   - Prefers in_progress tickets with complete deps
   - Then lowest priority todo ticket with complete deps
2. If no eligible ticket: write reports/ALL_DONE.txt and stop
3. Update ticket status to 'in_progress' if it was 'todo'
4. Generate runId as ISO timestamp
`}
            </Claude>
          </Step>

          {children}

          {/* Update state at end of each iteration */}
          <Step name={`${id}-update-state`}>
            <Claude model={contextValue.models.reporter ?? 'sonnet'} permissionMode="bypassPermissions">
              {`
UPDATE TICKET STATE

1. Check if ALL acceptance criteria are met for current ticket
2. Update ticket via db.tickets:
   - status: "done" if all criteria met, else "in_progress"
   - addProgressNote: what changed this run
3. If all tickets done: write reports/ALL_DONE.txt
`}
            </Claude>
          </Step>
        </Ralph>
      </KanbanContextInternal.Provider>
    </kanban-ralph>
  )
}

function ProcessTicketComponent(props: ProcessTicketProps): ReactNode {
  const { model, prompt, children } = props
  const ctx = useKanbanContextOptional()

  // Default context for when used outside Ralph (for testing)
  const effectiveModel = model ?? ctx?.models.executor ?? 'opus'
  const effectivePrompt = prompt ?? (ctx ? getProcessTicketPrompt(ctx) : 'No context available')

  const currentTicket = ctx?.getCurrentTicket()
  log.debug('ProcessTicketComponent render', {
    ticketId: currentTicket?.id,
    model: effectiveModel,
    hasCustomPrompt: !!prompt,
  })

  return (
    <process-ticket model={effectiveModel}>
      <Step name="process-ticket">
        <Claude model={effectiveModel} permissionMode="bypassPermissions">
          {effectivePrompt}
        </Claude>
        {children}
      </Step>
    </process-ticket>
  )
}

function ReviewTicketComponent(props: ReviewTicketProps): ReactNode {
  const { reviewers = ['claude'], model, children } = props
  const ctx = useKanbanContextOptional()

  const effectiveModel = model ?? ctx?.models.reviewer ?? 'sonnet'
  const currentTicket = ctx?.getCurrentTicket()

  log.debug('ReviewTicketComponent render', {
    ticketId: currentTicket?.id,
    reviewers,
    model: effectiveModel,
  })

  return (
    <review-ticket reviewers={reviewers.join(',')}>
      <Step name="review-ticket">
        <Claude model={effectiveModel} permissionMode="bypassPermissions">
          {ctx ? getReviewPrompt(ctx) : 'No context available'}
        </Claude>
        {children}
      </Step>
    </review-ticket>
  )
}

function CiComponent(props: CiProps): ReactNode {
  const { gates = ['lint', 'typecheck', 'test'], skipE2E = false, model, children } = props
  const ctx = useKanbanContextOptional()

  const effectiveModel = model ?? ctx?.models.executor ?? 'opus'
  const effectiveGates = [...gates]

  // Add e2e if ticket requires it and not skipped
  const currentTicket = ctx?.getCurrentTicket()
  if (currentTicket?.requiresE2E && !skipE2E && !effectiveGates.includes('e2e')) {
    effectiveGates.push('e2e')
  }

  log.debug('CiComponent render', {
    ticketId: currentTicket?.id,
    gates: effectiveGates,
    skipE2E,
  })

  return (
    <ci-gate gates={effectiveGates.join(',')} skip-e2e={skipE2E ? 'true' : 'false'}>
      <Step name="ci-gates">
        <Claude model={effectiveModel} permissionMode="bypassPermissions">
          {ctx ? getCiPrompt(ctx, effectiveGates) : 'No context available'}
        </Claude>
        {children}
      </Step>
    </ci-gate>
  )
}

// =============================================================================
// COMPOUND EXPORT
// =============================================================================

export const KanbanRalph = {
  Ralph: KanbanRalphRoot,
  ProcessTicket: ProcessTicketComponent,
  ReviewTicket: ReviewTicketComponent,
  Ci: CiComponent,
}

export default KanbanRalph

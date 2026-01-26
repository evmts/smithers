import { describe, test, expect, beforeEach } from 'bun:test'
import { createSmithersDB, type SmithersDB, type Ticket } from './index.js'

describe('TicketsModule', () => {
  let db: SmithersDB

  beforeEach(() => {
    db = createSmithersDB({ reset: true })
  })

  const testTickets: Ticket[] = [
    {
      id: 'T-001',
      priority: 1,
      title: 'First ticket',
      description: 'Description 1',
      deps: [],
      acceptance: ['Criterion 1', 'Criterion 2'],
      smallestStepHint: 'Do the smallest thing',
      tags: ['m0', 'backend'],
    },
    {
      id: 'T-002',
      priority: 2,
      title: 'Second ticket',
      description: 'Description 2',
      deps: ['T-001'],
      acceptance: ['Criterion A'],
      smallestStepHint: 'Another small thing',
      requiresE2E: true,
      tags: ['e2e'],
    },
    {
      id: 'T-003',
      priority: 0,
      title: 'High priority ticket',
      description: 'Urgent',
      deps: [],
      acceptance: ['Done'],
      smallestStepHint: 'Quickly',
      budgets: { maxFilesChanged: 5, maxLOC: 100 },
    },
  ]

  describe('seed', () => {
    test('inserts tickets with INSERT OR IGNORE', () => {
      db.tickets.seed(testTickets)
      const list = db.tickets.list()
      expect(list.length).toBe(3)
    })

    test('does not overwrite existing tickets', () => {
      db.tickets.seed(testTickets)
      db.tickets.updateStatus('T-001', 'in_progress')

      // Seed again
      db.tickets.seed(testTickets)

      const ticket = db.tickets.get('T-001')
      expect(ticket?.status).toBe('in_progress') // Should still be in_progress
    })
  })

  describe('get', () => {
    test('returns ticket by id', () => {
      db.tickets.seed(testTickets)
      const ticket = db.tickets.get('T-001')
      expect(ticket).not.toBeNull()
      expect(ticket?.title).toBe('First ticket')
      expect(ticket?.tags).toEqual(['m0', 'backend'])
    })

    test('returns null for non-existent ticket', () => {
      const ticket = db.tickets.get('T-999')
      expect(ticket).toBeNull()
    })
  })

  describe('list', () => {
    test('returns all tickets sorted by priority', () => {
      db.tickets.seed(testTickets)
      const list = db.tickets.list()
      expect(list[0].id).toBe('T-003') // priority 0
      expect(list[1].id).toBe('T-001') // priority 1
      expect(list[2].id).toBe('T-002') // priority 2
    })

    test('filters by status', () => {
      db.tickets.seed(testTickets)
      db.tickets.updateStatus('T-001', 'in_progress')

      const inProgress = db.tickets.list({ status: 'in_progress' })
      expect(inProgress.length).toBe(1)
      expect(inProgress[0].id).toBe('T-001')
    })

    test('filters by multiple statuses', () => {
      db.tickets.seed(testTickets)
      db.tickets.updateStatus('T-001', 'in_progress')
      db.tickets.updateStatus('T-002', 'done')

      const filtered = db.tickets.list({ status: ['in_progress', 'done'] })
      expect(filtered.length).toBe(2)
    })

    test('filters by tags', () => {
      db.tickets.seed(testTickets)
      const m0Tickets = db.tickets.list({ tags: ['m0'] })
      expect(m0Tickets.length).toBe(1)
      expect(m0Tickets[0].id).toBe('T-001')
    })

    test('filters by requiresE2E', () => {
      db.tickets.seed(testTickets)
      const e2eTickets = db.tickets.list({ requiresE2E: true })
      expect(e2eTickets.length).toBe(1)
      expect(e2eTickets[0].id).toBe('T-002')
    })

    test('excludes blocked tickets', () => {
      db.tickets.seed(testTickets)
      db.tickets.updateStatus('T-001', 'blocked', 'Missing API key')

      const nonBlocked = db.tickets.list({ excludeBlocked: true })
      expect(nonBlocked.length).toBe(2)
    })
  })

  describe('selectNext', () => {
    test('returns lowest priority todo ticket with complete deps', () => {
      db.tickets.seed(testTickets)
      const next = db.tickets.selectNext()
      expect(next?.id).toBe('T-003') // priority 0, no deps
    })

    test('prefers in_progress tickets', () => {
      db.tickets.seed(testTickets)
      db.tickets.updateStatus('T-001', 'in_progress')

      const next = db.tickets.selectNext()
      expect(next?.id).toBe('T-001')
    })

    test('skips tickets with incomplete deps', () => {
      db.tickets.seed(testTickets)
      // T-002 depends on T-001, T-003 has priority 0 but we check deps
      const next = db.tickets.selectNext()
      expect(next?.id).toBe('T-003')
    })

    test('returns ticket with complete deps', () => {
      db.tickets.seed(testTickets)
      db.tickets.updateStatus('T-001', 'done')
      db.tickets.updateStatus('T-003', 'done')

      const next = db.tickets.selectNext()
      expect(next?.id).toBe('T-002') // T-001 is done, so deps satisfied
    })

    test('excludes specified ticket id', () => {
      db.tickets.seed(testTickets)
      const next = db.tickets.selectNext('T-003')
      expect(next?.id).toBe('T-001') // Next lowest priority with complete deps
    })

    test('returns null when no eligible tickets', () => {
      db.tickets.seed(testTickets)
      db.tickets.updateStatus('T-001', 'done')
      db.tickets.updateStatus('T-002', 'done')
      db.tickets.updateStatus('T-003', 'done')

      const next = db.tickets.selectNext()
      expect(next).toBeNull()
    })
  })

  describe('updateStatus', () => {
    test('updates ticket status', () => {
      db.tickets.seed(testTickets)
      db.tickets.updateStatus('T-001', 'in_progress')

      const ticket = db.tickets.get('T-001')
      expect(ticket?.status).toBe('in_progress')
    })

    test('sets blocked reason', () => {
      db.tickets.seed(testTickets)
      db.tickets.updateStatus('T-001', 'blocked', 'Missing ANTHROPIC_API_KEY')

      const ticket = db.tickets.get('T-001')
      expect(ticket?.status).toBe('blocked')
      expect(ticket?.blockedReason).toBe('Missing ANTHROPIC_API_KEY')
    })
  })

  describe('addProgressNote', () => {
    test('appends note to progress notes', () => {
      db.tickets.seed(testTickets)
      db.tickets.addProgressNote('T-001', 'Started implementation')
      db.tickets.addProgressNote('T-001', 'Added tests')

      const ticket = db.tickets.get('T-001')
      expect(ticket?.progressNotes).toEqual(['Started implementation', 'Added tests'])
    })
  })

  describe('setLastRun', () => {
    test('updates last run metadata', () => {
      db.tickets.seed(testTickets)
      db.tickets.setLastRun('T-001', {
        runAt: '2026-01-26T10:00:00Z',
        reportPath: 'reports/run1',
        reviewDir: 'reviews/run1',
        ticketGoal: 'Add /chat endpoint',
      })

      const ticket = db.tickets.get('T-001')
      expect(ticket?.lastRunAt).toBe('2026-01-26T10:00:00Z')
      expect(ticket?.lastReportPath).toBe('reports/run1')
      expect(ticket?.lastReviewDir).toBe('reviews/run1')
      expect(ticket?.lastTicketGoal).toBe('Add /chat endpoint')
    })
  })

  describe('createFromTriage', () => {
    test('creates ticket from triage with source tracking', () => {
      const newTicket: Ticket = {
        id: 'TRIAGE-001',
        priority: 15,
        title: 'Triaged issue',
        description: 'Found during review',
        acceptance: ['Fixed'],
        smallestStepHint: 'Fix it',
        tags: ['bug'],
      }

      const id = db.tickets.createFromTriage(newTicket, 'report-123')
      expect(id).toBe('TRIAGE-001')

      const ticket = db.tickets.get(id)
      expect(ticket?.source).toBe('triage')
      expect(ticket?.sourceReportId).toBe('report-123')
      expect(ticket?.status).toBe('todo')
    })
  })

  describe('areDepsComplete', () => {
    test('returns true for ticket with no deps', () => {
      db.tickets.seed(testTickets)
      expect(db.tickets.areDepsComplete('T-001')).toBe(true)
    })

    test('returns false when deps not done', () => {
      db.tickets.seed(testTickets)
      expect(db.tickets.areDepsComplete('T-002')).toBe(false)
    })

    test('returns true when all deps done', () => {
      db.tickets.seed(testTickets)
      db.tickets.updateStatus('T-001', 'done')
      expect(db.tickets.areDepsComplete('T-002')).toBe(true)
    })
  })
})

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createSmithersDB, type SmithersDB } from '../../db/index.js'
import { generateReport } from './report-generator.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

describe('report-generator', () => {
  let db: SmithersDB
  let testDir: string

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `report-test-${Date.now()}`)
    fs.mkdirSync(testDir, { recursive: true })
    const dbPath = path.join(testDir, 'test.db')
    db = createSmithersDB(dbPath)
  })

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  describe('generateReport', () => {
    test('returns null when no execution exists', async () => {
      const result = await generateReport(db)
      expect(result).toBe(null)
    })

    test('generates report when execution exists', async () => {
      db.execution.start('test-execution', 'test.tsx')
      const result = await generateReport(db)
      expect(result).not.toBe(null)
      expect(result?.type).toBe('auto_summary')
      expect(result?.content).toContain('Execution Summary')
    })

    test('includes phase counts in report', async () => {
      db.execution.start('test-execution', 'test.tsx')
      db.phases.start('phase1')
      
      const result = await generateReport(db)
      expect(result?.content).toContain('Phases')
      expect(result?.content).toContain('Total: 1')
      expect(result?.content).toContain('Running: 1')
    })

    test('includes agent counts in report', async () => {
      db.execution.start('test-execution', 'test.tsx')
      const agentId = await db.agents.start('Test agent', 'sonnet', 'test')
      await db.agents.complete(agentId, 'done', {}, { input: 100, output: 50 })
      
      const result = await generateReport(db)
      expect(result?.content).toContain('Agents')
      expect(result?.content).toContain('Completed: 1')
    })

    test('sets severity to warning when failures exist', async () => {
      db.execution.start('test-execution', 'test.tsx')
      const agentId = await db.agents.start('Test agent', 'sonnet', 'test')
      await db.agents.fail(agentId, 'Something went wrong')
      
      const result = await generateReport(db)
      expect(result?.severity).toBe('warning')
    })

    test('sets severity to info when no failures', async () => {
      db.execution.start('test-execution', 'test.tsx')
      
      const result = await generateReport(db)
      expect(result?.severity).toBe('info')
    })
  })
})

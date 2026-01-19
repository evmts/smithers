/**
 * Tests for render-frames module - time-travel debugging frame storage
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ReactiveDatabase } from '../reactive-sqlite/database.js'
import { createRenderFramesModule } from './render-frames.js'

describe('RenderFramesModule', () => {
  let db: ReactiveDatabase
  let currentExecutionId: string | null = null

  const setupSchema = () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS render_frames (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        sequence_number INTEGER NOT NULL,
        tree_xml TEXT NOT NULL,
        ralph_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(execution_id, sequence_number)
      );
    `)
  }

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    setupSchema()
    currentExecutionId = null
  })

  afterEach(() => {
    db.close()
  })

  const createRenderFrames = () => {
    return createRenderFramesModule({
      rdb: db,
      getCurrentExecutionId: () => currentExecutionId
    })
  }

  describe('store', () => {
    test('creates frame with auto-incrementing sequence_number', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      renderFrames.store('<root />')
      renderFrames.store('<root><child /></root>')
      renderFrames.store('<root><child /><child /></root>')

      const frames = db.query<{ sequence_number: number }>('SELECT sequence_number FROM render_frames ORDER BY sequence_number')
      expect(frames.map(f => f.sequence_number)).toEqual([0, 1, 2])
    })

    test('returns unique id', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      const ids = new Set<string>()
      for (let i = 0; i < 50; i++) {
        ids.add(renderFrames.store(`<frame>${i}</frame>`))
      }
      expect(ids.size).toBe(50)
    })

    test('stores with default ralphCount of 0', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      const id = renderFrames.store('<root />')

      const frame = db.queryOne<{ ralph_count: number }>('SELECT ralph_count FROM render_frames WHERE id = ?', [id])
      expect(frame!.ralph_count).toBe(0)
    })

    test('stores with explicit ralphCount', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      const id = renderFrames.store('<root />', 42)

      const frame = db.queryOne<{ ralph_count: number }>('SELECT ralph_count FROM render_frames WHERE id = ?', [id])
      expect(frame!.ralph_count).toBe(42)
    })

    test('throws without active execution', () => {
      currentExecutionId = null
      const renderFrames = createRenderFrames()

      expect(() => renderFrames.store('<root />')).toThrow('No active execution')
    })

    test('stores empty tree_xml', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      const id = renderFrames.store('')

      const frame = db.queryOne<{ tree_xml: string }>('SELECT tree_xml FROM render_frames WHERE id = ?', [id])
      expect(frame!.tree_xml).toBe('')
    })

    test('stores very large tree_xml', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      const largeXml = '<root>' + '<child />'.repeat(10000) + '</root>'
      const id = renderFrames.store(largeXml)

      const frame = db.queryOne<{ tree_xml: string }>('SELECT tree_xml FROM render_frames WHERE id = ?', [id])
      expect(frame!.tree_xml).toBe(largeXml)
    })

    test('stores unicode in tree_xml', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      const unicodeXml = '<root>你好世界 🎉</root>'
      const id = renderFrames.store(unicodeXml)

      const frame = db.queryOne<{ tree_xml: string }>('SELECT tree_xml FROM render_frames WHERE id = ?', [id])
      expect(frame!.tree_xml).toBe(unicodeXml)
    })

    test('stores XML special characters in tree_xml', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      const specialXml = '<root attr="&quot;value&quot;">&lt;content&gt;</root>'
      const id = renderFrames.store(specialXml)

      const frame = db.queryOne<{ tree_xml: string }>('SELECT tree_xml FROM render_frames WHERE id = ?', [id])
      expect(frame!.tree_xml).toBe(specialXml)
    })

    test('returns uuid when db is closed', () => {
      currentExecutionId = 'exec-1'
      const renderFrames = createRenderFrames()
      db.close()

      const id = renderFrames.store('<root />')
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })

    test('handles negative ralphCount', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      const id = renderFrames.store('<root />', -5)

      const frame = db.queryOne<{ ralph_count: number }>('SELECT ralph_count FROM render_frames WHERE id = ?', [id])
      expect(frame!.ralph_count).toBe(-5)
    })
  })

  describe('get', () => {
    test('returns frame by id', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      const id = renderFrames.store('<root><child /></root>', 5)

      const frame = renderFrames.get(id)
      expect(frame).not.toBeNull()
      expect(frame!.id).toBe(id)
      expect(frame!.tree_xml).toBe('<root><child /></root>')
      expect(frame!.ralph_count).toBe(5)
    })

    test('returns null for non-existent id', () => {
      const renderFrames = createRenderFrames()
      const frame = renderFrames.get('nonexistent-id')
      expect(frame).toBeNull()
    })

    test('returns null when db is closed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()
      const id = renderFrames.store('<root />')
      db.close()

      expect(renderFrames.get(id)).toBeNull()
    })
  })

  describe('getBySequence', () => {
    test('returns frame by sequence number', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      renderFrames.store('<first />')
      const id = renderFrames.store('<second />')
      renderFrames.store('<third />')

      const frame = renderFrames.getBySequence(1)
      expect(frame).not.toBeNull()
      expect(frame!.id).toBe(id)
      expect(frame!.sequence_number).toBe(1)
    })

    test('returns null for non-existent sequence', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      renderFrames.store('<root />')

      const frame = renderFrames.getBySequence(999)
      expect(frame).toBeNull()
    })

    test('returns null without execution context', () => {
      currentExecutionId = null
      const renderFrames = createRenderFrames()

      const frame = renderFrames.getBySequence(0)
      expect(frame).toBeNull()
    })

    test('returns frame with sequence 0', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      const id = renderFrames.store('<first />')

      const frame = renderFrames.getBySequence(0)
      expect(frame).not.toBeNull()
      expect(frame!.id).toBe(id)
    })

    test('returns null when db is closed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()
      renderFrames.store('<root />')
      db.close()

      expect(renderFrames.getBySequence(0)).toBeNull()
    })
  })

  describe('list', () => {
    test('returns frames ordered by sequence_number ASC', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      const id1 = renderFrames.store('<first />')
      const id2 = renderFrames.store('<second />')
      const id3 = renderFrames.store('<third />')

      const frames = renderFrames.list()
      expect(frames).toHaveLength(3)
      expect(frames[0].id).toBe(id1)
      expect(frames[1].id).toBe(id2)
      expect(frames[2].id).toBe(id3)
    })

    test('returns empty array without execution context', () => {
      currentExecutionId = null
      const renderFrames = createRenderFrames()

      const frames = renderFrames.list()
      expect(frames).toEqual([])
    })

    test('returns empty array for no frames', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      const frames = renderFrames.list()
      expect(frames).toEqual([])
    })

    test('returns empty array when db is closed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()
      renderFrames.store('<root />')
      db.close()

      expect(renderFrames.list()).toEqual([])
    })
  })

  describe('listForExecution', () => {
    test('returns frames for specified execution', () => {
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-1'])
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-2'])
      const renderFrames = createRenderFrames()

      currentExecutionId = 'exec-1'
      renderFrames.store('<exec1-frame1 />')
      renderFrames.store('<exec1-frame2 />')

      currentExecutionId = 'exec-2'
      renderFrames.store('<exec2-frame1 />')

      const exec1Frames = renderFrames.listForExecution('exec-1')
      const exec2Frames = renderFrames.listForExecution('exec-2')

      expect(exec1Frames).toHaveLength(2)
      expect(exec2Frames).toHaveLength(1)
    })

    test('returns frames ordered by sequence_number ASC', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      renderFrames.store('<first />')
      renderFrames.store('<second />')
      renderFrames.store('<third />')

      const frames = renderFrames.listForExecution(currentExecutionId)
      expect(frames[0].sequence_number).toBe(0)
      expect(frames[1].sequence_number).toBe(1)
      expect(frames[2].sequence_number).toBe(2)
    })

    test('returns empty for non-existent execution', () => {
      const renderFrames = createRenderFrames()
      const frames = renderFrames.listForExecution('nonexistent')
      expect(frames).toEqual([])
    })

    test('returns empty array when db is closed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()
      renderFrames.store('<root />')
      db.close()

      expect(renderFrames.listForExecution(currentExecutionId)).toEqual([])
    })
  })

  describe('latest', () => {
    test('returns most recent frame', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      renderFrames.store('<first />')
      renderFrames.store('<second />')
      const lastId = renderFrames.store('<third />')

      const latest = renderFrames.latest()
      expect(latest).not.toBeNull()
      expect(latest!.id).toBe(lastId)
      expect(latest!.sequence_number).toBe(2)
    })

    test('returns null without execution context', () => {
      currentExecutionId = null
      const renderFrames = createRenderFrames()

      const latest = renderFrames.latest()
      expect(latest).toBeNull()
    })

    test('returns null when no frames', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      const latest = renderFrames.latest()
      expect(latest).toBeNull()
    })

    test('returns null when db is closed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()
      renderFrames.store('<root />')
      db.close()

      expect(renderFrames.latest()).toBeNull()
    })
  })

  describe('count', () => {
    test('returns correct frame count', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      expect(renderFrames.count()).toBe(0)

      renderFrames.store('<frame1 />')
      expect(renderFrames.count()).toBe(1)

      renderFrames.store('<frame2 />')
      renderFrames.store('<frame3 />')
      expect(renderFrames.count()).toBe(3)
    })

    test('returns 0 without execution context', () => {
      currentExecutionId = null
      const renderFrames = createRenderFrames()

      expect(renderFrames.count()).toBe(0)
    })

    test('returns 0 when no frames', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      expect(renderFrames.count()).toBe(0)
    })

    test('returns 0 when db is closed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()
      renderFrames.store('<root />')
      db.close()

      expect(renderFrames.count()).toBe(0)
    })
  })

  describe('nextSequence', () => {
    test('returns 0 for first frame', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      expect(renderFrames.nextSequence()).toBe(0)
    })

    test('returns correct next number', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()

      renderFrames.store('<frame1 />')
      expect(renderFrames.nextSequence()).toBe(1)

      renderFrames.store('<frame2 />')
      expect(renderFrames.nextSequence()).toBe(2)

      renderFrames.store('<frame3 />')
      expect(renderFrames.nextSequence()).toBe(3)
    })

    test('returns 0 without execution context', () => {
      currentExecutionId = null
      const renderFrames = createRenderFrames()

      expect(renderFrames.nextSequence()).toBe(0)
    })

    test('returns 0 when db is closed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()
      renderFrames.store('<root />')
      db.close()

      expect(renderFrames.nextSequence()).toBe(0)
    })
  })

  describe('multiple executions', () => {
    test('have independent sequences', () => {
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-1'])
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-2'])
      const renderFrames = createRenderFrames()

      currentExecutionId = 'exec-1'
      renderFrames.store('<exec1-frame0 />')
      renderFrames.store('<exec1-frame1 />')

      currentExecutionId = 'exec-2'
      renderFrames.store('<exec2-frame0 />')

      const exec1Frames = renderFrames.listForExecution('exec-1')
      const exec2Frames = renderFrames.listForExecution('exec-2')

      expect(exec1Frames[0].sequence_number).toBe(0)
      expect(exec1Frames[1].sequence_number).toBe(1)
      expect(exec2Frames[0].sequence_number).toBe(0)
    })
  })
})

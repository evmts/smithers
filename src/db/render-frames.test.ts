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

  const setActiveExecution = (id: string) => {
    db.run('INSERT INTO executions (id) VALUES (?)', [id])
    currentExecutionId = id
  }

  describe('Store operations', () => {
    test('store creates frame with auto-incrementing sequence_number', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      frames.store('<tree>1</tree>')
      frames.store('<tree>2</tree>')
      frames.store('<tree>3</tree>')
      
      const rows = db.query<any>('SELECT sequence_number FROM render_frames ORDER BY sequence_number')
      expect(rows.map(r => r.sequence_number)).toEqual([0, 1, 2])
    })

    test('store returns unique id', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      const ids = new Set<string>()
      for (let i = 0; i < 10; i++) {
        ids.add(frames.store(`<tree>${i}</tree>`))
      }
      expect(ids.size).toBe(10)
    })

    test('store with default ralphCount of 0', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      const id = frames.store('<tree/>')
      const rows = db.query<any>('SELECT ralph_count FROM render_frames WHERE id = ?', [id])
      expect(rows[0].ralph_count).toBe(0)
    })

    test('store with explicit ralphCount', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      const id = frames.store('<tree/>', 5)
      const rows = db.query<any>('SELECT ralph_count FROM render_frames WHERE id = ?', [id])
      expect(rows[0].ralph_count).toBe(5)
    })

    test('store throws without active execution', () => {
      const frames = createRenderFrames()
      expect(() => frames.store('<tree/>')).toThrow('No active execution')
    })

    test('store with empty tree_xml', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      const id = frames.store('')
      const rows = db.query<any>('SELECT tree_xml FROM render_frames WHERE id = ?', [id])
      expect(rows[0].tree_xml).toBe('')
    })

    test('store with very large tree_xml', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      const largeXml = '<tree>' + 'x'.repeat(100000) + '</tree>'
      const id = frames.store(largeXml)
      const rows = db.query<any>('SELECT tree_xml FROM render_frames WHERE id = ?', [id])
      expect(rows[0].tree_xml).toBe(largeXml)
    })

    test('store multiple frames increments sequence correctly', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      for (let i = 0; i < 5; i++) {
        frames.store(`<tree>${i}</tree>`)
      }
      const result = frames.list()
      expect(result.map(f => f.sequence_number)).toEqual([0, 1, 2, 3, 4])
    })
  })

  describe('Get operations', () => {
    test('get returns frame by id', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      const id = frames.store('<tree>test</tree>', 3)
      const frame = frames.get(id)
      expect(frame).not.toBeNull()
      expect(frame!.tree_xml).toBe('<tree>test</tree>')
      expect(frame!.ralph_count).toBe(3)
    })

    test('get returns null for non-existent id', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      const frame = frames.get('nonexistent-id')
      expect(frame).toBeNull()
    })
  })

  describe('GetBySequence operations', () => {
    test('getBySequence returns frame by sequence number', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      frames.store('<tree>0</tree>')
      frames.store('<tree>1</tree>')
      frames.store('<tree>2</tree>')
      
      const frame = frames.getBySequence(1)
      expect(frame).not.toBeNull()
      expect(frame!.tree_xml).toBe('<tree>1</tree>')
    })

    test('getBySequence returns null for non-existent sequence', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      frames.store('<tree>0</tree>')
      const frame = frames.getBySequence(99)
      expect(frame).toBeNull()
    })

    test('getBySequence returns null without execution context', () => {
      const frames = createRenderFrames()
      const frame = frames.getBySequence(0)
      expect(frame).toBeNull()
    })

    test('getBySequence with sequence 0', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      frames.store('<tree>first</tree>')
      const frame = frames.getBySequence(0)
      expect(frame).not.toBeNull()
      expect(frame!.tree_xml).toBe('<tree>first</tree>')
    })

    test('getBySequence with negative sequence', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      frames.store('<tree>0</tree>')
      const frame = frames.getBySequence(-1)
      expect(frame).toBeNull()
    })
  })

  describe('List operations', () => {
    test('list returns frames ordered by sequence_number ASC', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      frames.store('<tree>0</tree>')
      frames.store('<tree>1</tree>')
      frames.store('<tree>2</tree>')
      
      const result = frames.list()
      expect(result.map(f => f.tree_xml)).toEqual([
        '<tree>0</tree>',
        '<tree>1</tree>',
        '<tree>2</tree>'
      ])
    })

    test('list returns empty array without execution context', () => {
      const frames = createRenderFrames()
      const result = frames.list()
      expect(result).toEqual([])
    })

    test('list returns empty array for no frames', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      const result = frames.list()
      expect(result).toEqual([])
    })

    test('list returns empty array when db is closed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const renderFrames = createRenderFrames()
      renderFrames.store('<root />')
      db.close()

      expect(renderFrames.list()).toEqual([])
    })
  })

  describe('ListForExecution operations', () => {
    test('listForExecution returns frames for specified execution', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      frames.store('<tree>a</tree>')
      
      currentExecutionId = 'exec-2'
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-2'])
      frames.store('<tree>b</tree>')
      
      const result = frames.listForExecution('exec-1')
      expect(result).toHaveLength(1)
      expect(result[0].tree_xml).toBe('<tree>a</tree>')
    })

    test('listForExecution returns frames ordered by sequence_number ASC', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      frames.store('<tree>0</tree>')
      frames.store('<tree>1</tree>')
      
      const result = frames.listForExecution('exec-1')
      expect(result[0].sequence_number).toBe(0)
      expect(result[1].sequence_number).toBe(1)
    })

    test('listForExecution returns empty for non-existent execution', () => {
      const frames = createRenderFrames()
      const result = frames.listForExecution('nonexistent')
      expect(result).toEqual([])
    })

    test('listForExecution returns empty array when db is closed', () => {
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

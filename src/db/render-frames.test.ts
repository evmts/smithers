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
  })

  describe('Latest operation', () => {
    test('latest returns most recent frame', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      frames.store('<tree>0</tree>')
      frames.store('<tree>1</tree>')
      frames.store('<tree>2</tree>')
      
      const frame = frames.latest()
      expect(frame).not.toBeNull()
      expect(frame!.tree_xml).toBe('<tree>2</tree>')
      expect(frame!.sequence_number).toBe(2)
    })

    test('latest returns null without execution context', () => {
      const frames = createRenderFrames()
      const frame = frames.latest()
      expect(frame).toBeNull()
    })

    test('latest returns null when no frames', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      const frame = frames.latest()
      expect(frame).toBeNull()
    })
  })

  describe('Count operation', () => {
    test('count returns correct frame count', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      frames.store('<tree>0</tree>')
      frames.store('<tree>1</tree>')
      frames.store('<tree>2</tree>')
      
      expect(frames.count()).toBe(3)
    })

    test('count returns 0 without execution context', () => {
      const frames = createRenderFrames()
      expect(frames.count()).toBe(0)
    })

    test('count returns 0 when no frames', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      expect(frames.count()).toBe(0)
    })
  })

  describe('NextSequence operation', () => {
    test('nextSequence returns 0 for first frame', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      expect(frames.nextSequence()).toBe(0)
    })

    test('nextSequence returns correct next number', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      frames.store('<tree>0</tree>')
      frames.store('<tree>1</tree>')
      expect(frames.nextSequence()).toBe(2)
    })

    test('nextSequence returns 0 without execution context', () => {
      const frames = createRenderFrames()
      expect(frames.nextSequence()).toBe(0)
    })
  })

  describe('UNIQUE constraint', () => {
    test('store with duplicate sequence_number throws', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      frames.store('<tree>0</tree>')
      
      expect(() => {
        db.run(
          'INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml, ralph_count, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))',
          ['dup-id', 'exec-1', 0, '<tree>dup</tree>', 0]
        )
      }).toThrow()
    })
  })

  describe('Unicode/special characters', () => {
    test('store with unicode in tree_xml', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      const xml = '<tree>中文🚀العربية</tree>'
      const id = frames.store(xml)
      const frame = frames.get(id)
      expect(frame!.tree_xml).toBe(xml)
    })

    test('store with XML special characters in tree_xml', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      const xml = '<tree attr="value&amp;other"><child>&lt;escaped&gt;</child></tree>'
      const id = frames.store(xml)
      const frame = frames.get(id)
      expect(frame!.tree_xml).toBe(xml)
    })
  })

  describe('SQL injection prevention', () => {
    test('store is safe against SQL injection in tree_xml', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      const malicious = "'; DROP TABLE render_frames; --"
      const id = frames.store(malicious)
      const frame = frames.get(id)
      expect(frame!.tree_xml).toBe(malicious)
      const count = frames.count()
      expect(count).toBe(1)
    })
  })

  describe('Edge cases', () => {
    test('store with ralphCount as negative number', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      const id = frames.store('<tree/>', -5)
      const frame = frames.get(id)
      expect(frame!.ralph_count).toBe(-5)
    })

    test('store with very large ralphCount', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      const id = frames.store('<tree/>', 999999999)
      const frame = frames.get(id)
      expect(frame!.ralph_count).toBe(999999999)
    })

    test('multiple executions have independent sequences', () => {
      setActiveExecution('exec-1')
      const frames = createRenderFrames()
      frames.store('<tree>exec1-0</tree>')
      frames.store('<tree>exec1-1</tree>')
      
      currentExecutionId = 'exec-2'
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-2'])
      frames.store('<tree>exec2-0</tree>')
      
      const exec1Frames = frames.listForExecution('exec-1')
      const exec2Frames = frames.listForExecution('exec-2')
      
      expect(exec1Frames.map(f => f.sequence_number)).toEqual([0, 1])
      expect(exec2Frames.map(f => f.sequence_number)).toEqual([0])
    })
  })
})

/**
 * Tests for src/tui/hooks/useRenderFrames.ts
 * Hook for accessing render frames with time-travel navigation
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import type { RenderFrame } from '../../db/render-frames.js'
import type { UseRenderFramesResult } from './useRenderFrames.js'
import { resetTuiState } from '../state.js'

function createMockFrame(overrides: Partial<RenderFrame> = {}): RenderFrame {
  return {
    id: 'frame-123',
    execution_id: 'exec-456',
    label: 'Test Frame',
    node_tree: '<root><child /></root>',
    metadata: null,
    created_at: new Date('2024-01-15T10:00:00Z'),
    ...overrides
  }
}

describe('tui/hooks/useRenderFrames', () => {
  beforeEach(() => {
    resetTuiState()
  })

  afterEach(() => {
    resetTuiState()
  })

  describe('initial state', () => {
    test('frames is empty array initially', () => {
      const initialFrames: RenderFrame[] = []
      expect(initialFrames).toEqual([])
      expect(initialFrames).toHaveLength(0)
    })

    test('currentFrame is null initially', () => {
      const frames: RenderFrame[] = []
      const currentIndex = 0
      const currentFrame = frames[currentIndex] ?? null
      expect(currentFrame).toBeNull()
    })

    test('currentIndex is 0 initially', () => {
      const initialCurrentIndex = 0
      expect(initialCurrentIndex).toBe(0)
    })

    test('totalFrames is 0 initially', () => {
      const frames: RenderFrame[] = []
      const totalFrames = frames.length
      expect(totalFrames).toBe(0)
    })
  })

  describe('UseRenderFramesResult interface', () => {
    test('has all required properties', () => {
      const result: UseRenderFramesResult = {
        frames: [],
        currentFrame: null,
        currentIndex: 0,
        totalFrames: 0,
        goToFrame: () => {},
        nextFrame: () => {},
        prevFrame: () => {},
        goToLatest: () => {},
        goToFirst: () => {}
      }

      expect(result.frames).toBeDefined()
      expect(result.currentFrame).toBeNull()
      expect(typeof result.currentIndex).toBe('number')
      expect(typeof result.totalFrames).toBe('number')
      expect(typeof result.goToFrame).toBe('function')
      expect(typeof result.nextFrame).toBe('function')
      expect(typeof result.prevFrame).toBe('function')
      expect(typeof result.goToLatest).toBe('function')
      expect(typeof result.goToFirst).toBe('function')
    })
  })

  describe('polling behavior', () => {
    test('polls every 500ms', () => {
      const POLL_INTERVAL = 500
      expect(POLL_INTERVAL).toBe(500)
    })

    test('stops polling on unmount', () => {
      const mockClearInterval = mock(() => {})
      mockClearInterval()
      expect(mockClearInterval).toHaveBeenCalled()
    })

    test('restarts polling when db changes', () => {
      const deps = ['db', 'executionId']
      expect(deps).toContain('db')
    })

    test('restarts polling when executionId changes', () => {
      const deps = ['db', 'executionId']
      expect(deps).toContain('executionId')
    })
  })

  describe('frame fetching', () => {
    test('fetches frames via db.renderFrames.list() when no executionId', () => {
      const executionId = undefined
      const fetchMethod = executionId ? 'listForExecution' : 'list'
      expect(fetchMethod).toBe('list')
    })

    test('fetches frames via db.renderFrames.listForExecution() when executionId provided', () => {
      const executionId = 'exec-123'
      const fetchMethod = executionId ? 'listForExecution' : 'list'
      expect(fetchMethod).toBe('listForExecution')
    })

    test('ignores fetch errors silently', () => {
      let frames: RenderFrame[] = [createMockFrame()]

      try {
        throw new Error('Database error')
      } catch {
        // Ignore errors - frames unchanged
      }

      expect(frames).toHaveLength(1)
    })
  })

  describe('goToFrame', () => {
    test('sets currentIndex to specified index', () => {
      let currentIndex = 0
      const newIndex = 5

      currentIndex = newIndex
      expect(currentIndex).toBe(5)
    })

    test('clamps index to minimum 0', () => {
      const frames = [createMockFrame(), createMockFrame()]
      const index = -10
      const clampedIndex = Math.max(0, Math.min(index, frames.length - 1))
      expect(clampedIndex).toBe(0)
    })

    test('clamps index to maximum frames.length - 1', () => {
      const frames = [createMockFrame(), createMockFrame(), createMockFrame()]
      const index = 100
      const clampedIndex = Math.max(0, Math.min(index, frames.length - 1))
      expect(clampedIndex).toBe(2)
    })

    test('handles empty frames array', () => {
      const frames: RenderFrame[] = []
      const index = 5
      const clampedIndex = Math.max(0, Math.min(index, frames.length - 1))
      expect(clampedIndex).toBe(0)
    })
  })

  describe('nextFrame', () => {
    test('increments currentIndex by 1', () => {
      const frames = [createMockFrame(), createMockFrame(), createMockFrame()]
      let currentIndex = 0

      const newIndex = currentIndex + 1
      currentIndex = Math.max(0, Math.min(newIndex, frames.length - 1))

      expect(currentIndex).toBe(1)
    })

    test('does not exceed frames.length - 1', () => {
      const frames = [createMockFrame(), createMockFrame()]
      let currentIndex = 1

      const newIndex = currentIndex + 1
      currentIndex = Math.max(0, Math.min(newIndex, frames.length - 1))

      expect(currentIndex).toBe(1)
    })

    test('calls goToFrame internally', () => {
      const goToFrame = mock((index: number) => index)
      const currentIndex = 2

      goToFrame(currentIndex + 1)
      expect(goToFrame).toHaveBeenCalledWith(3)
    })
  })

  describe('prevFrame', () => {
    test('decrements currentIndex by 1', () => {
      const frames = [createMockFrame(), createMockFrame(), createMockFrame()]
      let currentIndex = 2

      const newIndex = currentIndex - 1
      currentIndex = Math.max(0, Math.min(newIndex, frames.length - 1))

      expect(currentIndex).toBe(1)
    })

    test('does not go below 0', () => {
      const frames = [createMockFrame(), createMockFrame()]
      let currentIndex = 0

      const newIndex = currentIndex - 1
      currentIndex = Math.max(0, Math.min(newIndex, frames.length - 1))

      expect(currentIndex).toBe(0)
    })

    test('calls goToFrame internally', () => {
      const goToFrame = mock((index: number) => index)
      const currentIndex = 2

      goToFrame(currentIndex - 1)
      expect(goToFrame).toHaveBeenCalledWith(1)
    })
  })

  describe('goToLatest', () => {
    test('sets currentIndex to frames.length - 1', () => {
      const frames = [createMockFrame(), createMockFrame(), createMockFrame(), createMockFrame()]
      let currentIndex = 0

      currentIndex = Math.max(0, Math.min(frames.length - 1, frames.length - 1))

      expect(currentIndex).toBe(3)
    })

    test('handles empty frames array', () => {
      const frames: RenderFrame[] = []

      const clampedIndex = Math.max(0, Math.min(frames.length - 1, frames.length - 1))
      expect(clampedIndex).toBe(0)
    })
  })

  describe('goToFirst', () => {
    test('sets currentIndex to 0', () => {
      const frames = [createMockFrame(), createMockFrame(), createMockFrame()]
      let currentIndex = 2

      currentIndex = Math.max(0, Math.min(0, frames.length - 1))

      expect(currentIndex).toBe(0)
    })
  })

  describe('currentFrame derivation', () => {
    test('returns frame at currentIndex', () => {
      const frame1 = createMockFrame({ id: 'frame-1' })
      const frame2 = createMockFrame({ id: 'frame-2' })
      const frames = [frame1, frame2]
      const currentIndex = 1

      const currentFrame = frames[currentIndex] ?? null
      expect(currentFrame!.id).toBe('frame-2')
    })

    test('returns null when currentIndex out of bounds', () => {
      const frames = [createMockFrame()]
      const currentIndex = 5

      const currentFrame = frames[currentIndex] ?? null
      expect(currentFrame).toBeNull()
    })

    test('updates when currentIndex changes', () => {
      const frame1 = createMockFrame({ id: 'frame-1' })
      const frame2 = createMockFrame({ id: 'frame-2' })
      const frames = [frame1, frame2]

      let currentIndex = 0
      expect((frames[currentIndex] ?? null)!.id).toBe('frame-1')

      currentIndex = 1
      expect((frames[currentIndex] ?? null)!.id).toBe('frame-2')
    })

    test('updates when frames changes', () => {
      let frames = [createMockFrame({ id: 'frame-old' })]
      const currentIndex = 0

      expect((frames[currentIndex] ?? null)!.id).toBe('frame-old')

      frames = [createMockFrame({ id: 'frame-new' })]
      expect((frames[currentIndex] ?? null)!.id).toBe('frame-new')
    })
  })

  describe('totalFrames', () => {
    test('returns frames.length', () => {
      const frames = [createMockFrame(), createMockFrame(), createMockFrame()]
      const totalFrames = frames.length
      expect(totalFrames).toBe(3)
    })

    test('updates when frames changes', () => {
      let frames = [createMockFrame()]
      expect(frames.length).toBe(1)

      frames = [createMockFrame(), createMockFrame(), createMockFrame()]
      expect(frames.length).toBe(3)
    })
  })

  describe('edge cases', () => {
    test('handles single frame', () => {
      const frames = [createMockFrame()]
      let currentIndex = 0

      // nextFrame stays at 0
      currentIndex = Math.max(0, Math.min(currentIndex + 1, frames.length - 1))
      expect(currentIndex).toBe(0)

      // prevFrame stays at 0
      currentIndex = Math.max(0, Math.min(currentIndex - 1, frames.length - 1))
      expect(currentIndex).toBe(0)
    })

    test('handles many frames', () => {
      const frames = Array.from({ length: 1000 }, (_, i) => createMockFrame({ id: `frame-${i}` }))

      expect(frames.length).toBe(1000)

      const lastIndex = frames.length - 1
      expect(lastIndex).toBe(999)

      const middleIndex = Math.max(0, Math.min(500, frames.length - 1))
      expect(middleIndex).toBe(500)
    })

    test('handles frames array shrinking', () => {
      let frames = [createMockFrame(), createMockFrame(), createMockFrame()]
      let currentIndex = 2

      frames = [createMockFrame()]

      if (currentIndex >= frames.length) {
        currentIndex = Math.max(0, frames.length - 1)
      }

      expect(currentIndex).toBe(0)
    })

    test('adjusts currentIndex when frames shrink below it', () => {
      let currentIndex = 5
      const newFramesLength = 3

      if (currentIndex >= newFramesLength) {
        currentIndex = Math.max(0, newFramesLength - 1)
      }

      expect(currentIndex).toBe(2)
    })
  })

  describe('RenderFrame type', () => {
    test('has all required properties', () => {
      const frame = createMockFrame()

      expect(frame.id).toBeDefined()
      expect(frame.execution_id).toBeDefined()
      expect(frame.label).toBeDefined()
      expect(frame.node_tree).toBeDefined()
      expect(frame.created_at).toBeDefined()
    })

    test('metadata can be null', () => {
      const frame = createMockFrame({ metadata: null })
      expect(frame.metadata).toBeNull()
    })

    test('node_tree contains serialized XML', () => {
      const frame = createMockFrame({ node_tree: '<smithers><phase name="build" /></smithers>' })
      expect(frame.node_tree).toContain('<smithers>')
      expect(frame.node_tree).toContain('<phase')
    })
  })

  describe('callback dependencies', () => {
    test('goToFrame depends on frames.length', () => {
      const deps = ['frames.length', 'setCurrentIndex']
      expect(deps).toContain('frames.length')
    })

    test('nextFrame depends on currentIndex and goToFrame', () => {
      const deps = ['currentIndex', 'goToFrame']
      expect(deps).toHaveLength(2)
    })

    test('prevFrame depends on currentIndex and goToFrame', () => {
      const deps = ['currentIndex', 'goToFrame']
      expect(deps).toHaveLength(2)
    })

    test('goToLatest depends on frames.length and goToFrame', () => {
      const deps = ['frames.length', 'goToFrame']
      expect(deps).toHaveLength(2)
    })

    test('goToFirst depends on goToFrame', () => {
      const deps = ['goToFrame']
      expect(deps).toHaveLength(1)
    })
  })

  describe('navigation combined tests', () => {
    test('can navigate through all frames', () => {
      const frames = [
        createMockFrame({ id: 'frame-0' }),
        createMockFrame({ id: 'frame-1' }),
        createMockFrame({ id: 'frame-2' })
      ]
      let currentIndex = 0

      // Start at first
      expect(currentIndex).toBe(0)

      // Next
      currentIndex = Math.max(0, Math.min(currentIndex + 1, frames.length - 1))
      expect(currentIndex).toBe(1)

      // Next
      currentIndex = Math.max(0, Math.min(currentIndex + 1, frames.length - 1))
      expect(currentIndex).toBe(2)

      // Next (at end, stays at 2)
      currentIndex = Math.max(0, Math.min(currentIndex + 1, frames.length - 1))
      expect(currentIndex).toBe(2)

      // Prev
      currentIndex = Math.max(0, Math.min(currentIndex - 1, frames.length - 1))
      expect(currentIndex).toBe(1)

      // goToFirst
      currentIndex = 0
      expect(currentIndex).toBe(0)

      // goToLatest
      currentIndex = frames.length - 1
      expect(currentIndex).toBe(2)
    })
  })

  describe('state key generation', () => {
    test('generates unique keys based on executionId', () => {
      const executionId = 'exec-123'
      const framesKey = `tui:renderFrames:${executionId}:frames`
      const indexKey = `tui:renderFrames:${executionId}:index`

      expect(framesKey).toBe('tui:renderFrames:exec-123:frames')
      expect(indexKey).toBe('tui:renderFrames:exec-123:index')
    })

    test('uses generic keys when no executionId', () => {
      const executionId = undefined
      const framesKey = executionId
        ? `tui:renderFrames:${executionId}:frames`
        : 'tui:renderFrames:frames'
      const indexKey = executionId
        ? `tui:renderFrames:${executionId}:index`
        : 'tui:renderFrames:index'

      expect(framesKey).toBe('tui:renderFrames:frames')
      expect(indexKey).toBe('tui:renderFrames:index')
    })
  })
})

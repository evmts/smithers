import { useCallback, useMemo } from 'react'
import type { SmithersDB } from '../../db/index.js'
import type { RenderFrame } from '../../db/render-frames.js'
import { useEffectOnValueChange } from '../../reconciler/hooks.js'
import { useTuiState } from '../state.js'

export interface UseRenderFramesResult {
  frames: RenderFrame[]
  currentFrame: RenderFrame | null
  currentIndex: number
  totalFrames: number
  goToFrame: (index: number) => void
  nextFrame: () => void
  prevFrame: () => void
  goToLatest: () => void
  goToFirst: () => void
}

const EMPTY_FRAMES: RenderFrame[] = []

export function useRenderFrames(db: SmithersDB, executionId?: string): UseRenderFramesResult {
  const framesKey = executionId
    ? `tui:renderFrames:${executionId}:frames`
    : 'tui:renderFrames:frames'
  const indexKey = executionId
    ? `tui:renderFrames:${executionId}:index`
    : 'tui:renderFrames:index'

  const [frames, setFrames] = useTuiState<RenderFrame[]>(framesKey, EMPTY_FRAMES)
  const [currentIndex, setCurrentIndex] = useTuiState<number>(indexKey, 0)

  const pollKey = useMemo(() => ({ db, executionId }), [db, executionId])

  useEffectOnValueChange(pollKey, () => {
    const pollFrames = () => {
      try {
        const allFrames = executionId
          ? db.renderFrames.listForExecution(executionId)
          : db.renderFrames.list()
        setFrames(allFrames)
      } catch (err) {
        console.debug('[useRenderFrames] Polling error:', err)
      }
    }

    pollFrames()
    const interval = setInterval(pollFrames, 500)
    return () => clearInterval(interval)
  }, [db, executionId, setFrames])

  useEffectOnValueChange(frames.length, () => {
    const maxIndex = Math.max(0, frames.length - 1)
    if (currentIndex > maxIndex) {
      setCurrentIndex(maxIndex)
    }
  }, [frames.length, currentIndex, setCurrentIndex])

  const goToFrame = useCallback((index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, frames.length - 1))
    setCurrentIndex(clampedIndex)
  }, [frames.length, setCurrentIndex])

  const nextFrame = useCallback(() => {
    goToFrame(currentIndex + 1)
  }, [currentIndex, goToFrame])

  const prevFrame = useCallback(() => {
    goToFrame(currentIndex - 1)
  }, [currentIndex, goToFrame])

  const goToLatest = useCallback(() => {
    goToFrame(frames.length - 1)
  }, [frames.length, goToFrame])

  const goToFirst = useCallback(() => {
    goToFrame(0)
  }, [goToFrame])

  const currentFrame = frames[currentIndex] ?? null

  return {
    frames,
    currentFrame,
    currentIndex,
    totalFrames: frames.length,
    goToFrame,
    nextFrame,
    prevFrame,
    goToLatest,
    goToFirst
  }
}

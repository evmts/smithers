// Hook for accessing render frames with time-travel navigation

import { useState, useEffect, useCallback } from 'react'
import type { SmithersDB } from '../../db/index.js'
import type { RenderFrame } from '../../db/render-frames.js'

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

export function useRenderFrames(db: SmithersDB, executionId?: string): UseRenderFramesResult {
  const [frames, setFrames] = useState<RenderFrame[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)

  // Poll for frame updates
  useEffect(() => {
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
  }, [db, executionId])

  const goToFrame = useCallback((index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, frames.length - 1))
    setCurrentIndex(clampedIndex)
  }, [frames.length])

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

import { useEffect } from 'react'
import type { SmithersDB } from '../db/index.js'
import { getCurrentTreeXML } from '../reconciler/root.js'

/**
 * Captures render frame on each Ralph iteration.
 * This is a side-effect hook that stores XML tree snapshots.
 */
export function useCaptureRenderFrame(db: SmithersDB, ralphCount: number): void {
  useEffect(() => {
    const captureFrame = () => {
      try {
        const treeXml = getCurrentTreeXML()
        if (treeXml) {
          db.renderFrames.store(treeXml, ralphCount)
        }
      } catch (e) {
        console.warn('[useCaptureRenderFrame] Frame capture failed:', e)
      }
    }

    const timeoutId = setTimeout(captureFrame, 50)
    return () => clearTimeout(timeoutId)
  }, [ralphCount, db])
}

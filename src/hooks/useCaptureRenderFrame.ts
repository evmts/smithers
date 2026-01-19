import type { SmithersDB } from '../db/index.js'
import { useEffectOnValueChange } from '../reconciler/hooks.js'

const CAPTURE_DELAY_MS = 50

/**
 * Captures render frame on each Ralph iteration.
 * This is a side-effect hook that stores XML tree snapshots.
 */
export function useCaptureRenderFrame(
  db: SmithersDB,
  ralphCount: number,
  getTreeXML?: () => string | null
): void {
  useEffectOnValueChange(ralphCount, () => {
    const captureFrame = () => {
      try {
        const treeXml = getTreeXML?.()
        if (!treeXml) return
        db.renderFrames.store(treeXml, ralphCount)
      } catch (e) {
        console.warn('[useCaptureRenderFrame] Frame capture failed:', e)
      }
    }

    const timeoutId = setTimeout(captureFrame, CAPTURE_DELAY_MS)
    return () => clearTimeout(timeoutId)
  }, [db, getTreeXML])
}

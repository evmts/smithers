import type { SmithersDB } from '../db/index.js'
import { useEffectOnValueChange } from '../reconciler/hooks.js'

const CAPTURE_DELAY_MS = 50

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
        console.debug('[useCaptureRenderFrame] Frame capture failed:', e)
      }
    }

    const timeoutId = setTimeout(captureFrame, CAPTURE_DELAY_MS)
    return () => clearTimeout(timeoutId)
  }, [db, getTreeXML])
}

/**
 * Debug and observability utilities
 */

import type { DebugEvent } from '../core/types.js'

export interface DebugCollector {
  emit(event: DebugEvent): void
}

export type { DebugEvent }

export function createDebugCollector(): DebugCollector {
  return {
    emit(event: DebugEvent): void {
      console.log('[Debug]', event)
    },
  }
}

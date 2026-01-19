// Hook for managing pending human interaction requests

import { useCallback } from 'react'
import type { SmithersDB } from '../../db/index.js'
import type { HumanInteraction } from '../../db/human.js'
import { useEffectOnValueChange } from '../../reconciler/hooks.js'
import { useTuiState } from '../state.js'

export interface UseHumanRequestsResult {
  pendingRequests: HumanInteraction[]
  selectedIndex: number
  selectedRequest: HumanInteraction | null
  selectRequest: (index: number) => void
  approveRequest: (response?: unknown) => void
  rejectRequest: (response?: unknown) => void
  refreshRequests: () => void
}

export function useHumanRequests(db: SmithersDB): UseHumanRequestsResult {
  const [pendingRequests, setPendingRequests] = useTuiState<HumanInteraction[]>(
    'tui:human:pendingRequests',
    []
  )
  const [selectedIndex, setSelectedIndex] = useTuiState<number>(
    'tui:human:selectedIndex',
    0
  )

  const refreshRequests = useCallback(() => {
    try {
      const pending = db.human.listPending()
      setPendingRequests(pending)
    } catch {
      // Ignore errors
    }
  }, [db, setPendingRequests])

  useEffectOnValueChange(db, () => {
    refreshRequests()
    const interval = setInterval(refreshRequests, 500)
    return () => clearInterval(interval)
  }, [refreshRequests])

  useEffectOnValueChange(pendingRequests.length, () => {
    const maxIndex = Math.max(0, pendingRequests.length - 1)
    if (selectedIndex > maxIndex) {
      setSelectedIndex(maxIndex)
    }
  }, [pendingRequests.length, selectedIndex, setSelectedIndex])

  const selectRequest = useCallback((index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, pendingRequests.length - 1))
    setSelectedIndex(clampedIndex)
  }, [pendingRequests.length, setSelectedIndex])

  const approveRequest = useCallback((response?: unknown) => {
    const request = pendingRequests[selectedIndex]
    if (!request) return

    try {
      db.human.resolve(request.id, 'approved', response)
      refreshRequests()
    } catch {
      // Ignore errors
    }
  }, [db, pendingRequests, selectedIndex, refreshRequests])

  const rejectRequest = useCallback((response?: unknown) => {
    const request = pendingRequests[selectedIndex]
    if (!request) return

    try {
      db.human.resolve(request.id, 'rejected', response)
      refreshRequests()
    } catch {
      // Ignore errors
    }
  }, [db, pendingRequests, selectedIndex, refreshRequests])

  const selectedRequest = pendingRequests[selectedIndex] ?? null

  return {
    pendingRequests,
    selectedIndex,
    selectedRequest,
    selectRequest,
    approveRequest,
    rejectRequest,
    refreshRequests
  }
}

// Hook for managing pending human interaction requests

import { useState, useEffect, useCallback } from 'react'
import type { SmithersDB } from '../../db/index.js'
import type { HumanInteraction } from '../../db/human.js'

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
  const [pendingRequests, setPendingRequests] = useState<HumanInteraction[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  const refreshRequests = useCallback(() => {
    try {
      const pending = db.human.listPending()
      setPendingRequests(pending)
      // Ensure selectedIndex is valid
      if (selectedIndex >= pending.length && pending.length > 0) {
        setSelectedIndex(pending.length - 1)
      }
    } catch {
      // Ignore errors
    }
  }, [db, selectedIndex])

  // Poll for updates
  useEffect(() => {
    refreshRequests()
    const interval = setInterval(refreshRequests, 500)
    return () => clearInterval(interval)
  }, [refreshRequests])

  const selectRequest = useCallback((index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, pendingRequests.length - 1))
    setSelectedIndex(clampedIndex)
  }, [pendingRequests.length])

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

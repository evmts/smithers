// useRalphCount - Reactive hook for getting the current Ralph iteration count
// This hook subscribes to the database for reactive updates when ralphCount changes

import { useSmithers } from '../components/SmithersProvider.js'
import { useQueryValue } from '../reactive-sqlite/index.js'

/**
 * Hook to get the current Ralph iteration count reactively.
 * Subscribes to the database so components re-render when ralphCount changes.
 *
 * @returns The current ralph iteration count (0-indexed)
 */
export function useRalphCount(): number {
  const { db } = useSmithers()
  const { data } = useQueryValue<number>(
    db.db,
    "SELECT CAST(value AS INTEGER) as count FROM state WHERE key = 'ralphCount'"
  )
  return data ?? 0
}

import { useSmithers } from '../components/SmithersProvider.js'
import { useQueryValue } from '../reactive-sqlite/index.js'

export function useRalphCount(): number {
  const { db } = useSmithers()
  const { data } = useQueryValue<number>(
    db.db,
    "SELECT CAST(value AS INTEGER) as count FROM state WHERE key = 'ralphCount'"
  )
  return data ?? 0
}

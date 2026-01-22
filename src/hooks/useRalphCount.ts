import { useSmithers } from '../components/SmithersProvider.js'
import { useQueryValue } from '../reactive-sqlite/index.js'

const RALPH_COUNT_QUERY = "SELECT CAST(value AS INTEGER) as count FROM state WHERE key = 'ralphCount'"

export function useRalphCount(): number {
  const { db } = useSmithers()
  const { data } = useQueryValue<number>(db.db, RALPH_COUNT_QUERY)
  return data ?? 0
}

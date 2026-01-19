import type { SmithersDB } from '../../db/index.js'
import { printSectionHeader } from './view-utils.js'

interface MemoryStats {
  total: number
  byCategory: Record<string, number>
  byScope: Record<string, number>
}

interface Memory {
  category: string
  key: string
  content: string
  confidence: number
  source?: string
}

export async function showMemories(db: SmithersDB) {
  const headerLine = '═══════════════════════════════════════════════════════════'
  printSectionHeader(headerLine, 'MEMORIES')

  const stats: MemoryStats = await db.memories.stats()

  console.log(`  Total: ${stats.total}`)
  console.log('')

  console.log('  By Category:')
  for (const [category, count] of Object.entries(stats.byCategory)) {
    console.log(`    ${category}: ${count}`)
  }
  console.log('')

  console.log('  By Scope:')
  for (const [scope, count] of Object.entries(stats.byScope)) {
    console.log(`    ${scope}: ${count}`)
  }
  console.log('')

  const recent: Memory[] = await db.memories.list(undefined, undefined, 5)

  if (recent.length > 0) {
    console.log('  Recent Memories:')
    console.log('')

    for (const m of recent) {
      console.log(`    [${m.category}] ${m.key}`)
      console.log(`      ${m.content.substring(0, 100)}${m.content.length > 100 ? '...' : ''}`)
      console.log(`      Confidence: ${m.confidence}, Source: ${m.source || 'unknown'}`)
      console.log('')
    }
  }
}

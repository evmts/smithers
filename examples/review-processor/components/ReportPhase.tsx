/**
 * ReportPhase - Generate final processing report
 */

import type { ReactNode } from 'react'
import { useSmithers } from '../../../src/components/SmithersProvider.js'
import { useQueryValue } from '../../../src/reactive-sqlite/index.js'
import { Step } from '../../../src/components/Step.js'
import { Claude } from '../../../src/components/Claude.js'
import type { ProcessorState } from '../types.js'

function parseState<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export interface ReportPhaseProps {
  stateKey: string
}

export function ReportPhase({ stateKey }: ReportPhaseProps): ReactNode {
  const { reactiveDb } = useSmithers()

  const { data: storedState } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = ?",
    [stateKey]
  )

  const state: ProcessorState = parseState(storedState, {
    reviews: [],
    scanned: false,
    activeAgents: 0,
    completed: [],
    failed: [],
  })

  const implemented = state.reviews.filter(r => r.status === 'implemented')
  const closed = state.reviews.filter(r => r.status === 'closed')
  const failed = state.reviews.filter(r => r.status === 'failed')
  const pending = state.reviews.filter(r => r.status === 'pending')

  return (
    <report>
      <summary>
        <total>{state.reviews.length}</total>
        <implemented>{implemented.length}</implemented>
        <closed>{closed.length}</closed>
        <failed>{failed.length}</failed>
        <pending>{pending.length}</pending>
      </summary>

      <Step name="Generate Report">
        <Claude>
          {`Generate a summary report of review processing:

Implemented: ${implemented.length}
Closed (already done): ${closed.length}
Failed: ${failed.length}
Still pending: ${pending.length}

${failed.length > 0 ? `Failed reviews:\n${failed.map(r => `- ${r.name}: ${r.error ?? 'unknown error'}`).join('\n')}` : ''}

Create a brief markdown summary and save to reviews/PROCESSING_REPORT.md`}
        </Claude>
      </Step>
    </report>
  )
}

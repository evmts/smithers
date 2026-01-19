/**
 * ReviewProcessor - Main orchestration component
 * 
 * Coordinates:
 * 1. Scan all reviews
 * 2. Parallel process non-difficult (16 concurrent)
 * 3. Serial process difficult reviews
 * 4. Generate report
 */

import { useRef, type ReactNode } from 'react'
import { useSmithers } from '../../src/components/SmithersProvider.js'
import { Phase } from '../../src/components/Phase.js'
import { Ralph } from '../../src/components/Ralph.js'
import { useMount } from '../../src/reconciler/hooks.js'
import { useQueryValue } from '../../src/reactive-sqlite/index.js'
import { ScanPhase } from './components/ScanPhase.js'
import { ParallelProcessPhase } from './components/ParallelProcessPhase.js'
import { SerialProcessPhase } from './components/SerialProcessPhase.js'
import { ReportPhase } from './components/ReportPhase.js'
import type { ProcessorState, ReviewInfo } from './types.js'

function parseState<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export interface ReviewProcessorProps {
  maxParallel: number
  reviewsDir: string
}

export function ReviewProcessor({ maxParallel, reviewsDir }: ReviewProcessorProps): ReactNode {
  const { db, reactiveDb } = useSmithers()
  const stateKey = 'review-processor:state'

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

  const hasScannedRef = useRef(false)

  useMount(() => {
    if (hasScannedRef.current || state.scanned) return
    hasScannedRef.current = true

    ;(async () => {
      try {
        console.log('[ReviewProcessor] Scanning reviews directory...')

        const files = await Bun.$`ls -1 ${reviewsDir}/*.md 2>/dev/null`.text()
        const filenames = files.trim().split('\n').filter(Boolean)

        const reviews: ReviewInfo[] = []
        for (const filepath of filenames) {
          const content = await Bun.file(filepath).text()
          const name = filepath.split('/').pop()?.replace('.md', '') ?? ''
          
          // Check for difficulty markers
          const isDifficult = 
            content.includes('DIFFICULT') ||
            content.includes('complexity:') && content.includes('high') ||
            content.includes('## Priority') && content.includes('difficult')

          reviews.push({
            name,
            path: filepath,
            content,
            isDifficult,
            status: 'pending',
            retries: 0,
          })
        }

        const newState: ProcessorState = {
          reviews,
          scanned: true,
          activeAgents: 0,
          completed: [],
          failed: [],
        }

        db.state.set(stateKey, newState, 'scan-complete')
        console.log(`[ReviewProcessor] Found ${reviews.length} reviews (${reviews.filter(r => r.isDifficult).length} difficult)`)
      } catch (err) {
        console.error('[ReviewProcessor] Scan failed:', err)
      }
    })()
  })

  if (!state.scanned) {
    return <processor status="scanning">Scanning reviews directory...</processor>
  }

  const normalReviews = state.reviews.filter(r => !r.isDifficult)
  const difficultReviews = state.reviews.filter(r => r.isDifficult)

  return (
    <Ralph maxIterations={100}>
      <Phase name="Scan Reviews">
        <ScanPhase reviews={state.reviews} />
      </Phase>

      <Phase name="Parallel Processing">
        <ParallelProcessPhase 
          reviews={normalReviews} 
          maxParallel={maxParallel}
          stateKey={stateKey}
        />
      </Phase>

      <Phase name="Serial Processing">
        <SerialProcessPhase 
          reviews={difficultReviews}
          stateKey={stateKey}
        />
      </Phase>

      <Phase name="Report">
        <ReportPhase stateKey={stateKey} />
      </Phase>
    </Ralph>
  )
}

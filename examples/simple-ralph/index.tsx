#!/usr/bin/env smithers
/**
 * Simple Ralph - Minimal iterative workflow with PRD context
 *
 * Reads a PRD file and iterates with Codex until the task is complete.
 * Demonstrates the basic Ralph loop pattern.
 */

import { readFileSync } from 'node:fs'
import { SmithersProvider } from '../../src/components/SmithersProvider.js'
import { Ralph } from '../../src/components/Ralph.js'
import { Codex } from '../../src/components/Codex.js'
import { createSmithersDB } from '../../src/db/index.js'
import { createSmithersRoot } from '../../src/reconciler/index.js'

const db = createSmithersDB({ path: '.smithers/simple-ralph.db' })
const executionId = db.execution.start('Simple Ralph', 'simple-ralph/index.tsx')

// Read PRD for context
const prd = readFileSync('./prd.md', 'utf-8')

function SimpleRalph() {
  const done = db.state.get('done') === 'true'

  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Ralph
        id="simple-ralph"
        condition={() => !done}
        maxIterations={10}
        onIteration={(i) => console.log(`Iteration ${i}`)}
        onComplete={(iterations, reason) => console.log(`Done after ${iterations} iterations (${reason})`)}
      >
        <Codex
          model="o4-mini"
          fullAuto
          onFinished={(result) => {
            console.log('Codex output:', result.output?.slice(0, 200))
            // Mark done when task is complete
            if (result.output?.includes('TASK_COMPLETE')) {
              db.state.set('done', 'true')
            }
          }}
        >
          {`# Product Requirements Document

${prd}

# Instructions

Implement the requirements above. When finished, output "TASK_COMPLETE".`}
        </Codex>
      </Ralph>
    </SmithersProvider>
  )
}

const root = createSmithersRoot()
try {
  await root.mount(SimpleRalph)
  db.execution.complete(executionId, { summary: 'Simple Ralph completed' })
} catch (err) {
  db.execution.fail(executionId, String(err))
  throw err
} finally {
  db.close()
}

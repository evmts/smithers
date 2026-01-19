/**
 * RootMdCleanup - Phase 4: Clean up root .md files
 */

import type { ReactNode } from 'react'
import { Step } from '../../src/components/Step.js'
import { If } from '../../src/components/If.js'
import { Claude } from '../../src/components/Claude.js'
import type { RootMdFile } from './types.js'

export interface RootMdCleanupProps {
  files: RootMdFile[]
}

export function RootMdCleanup({ files }: RootMdCleanupProps): ReactNode {
  const emptyFiles = files.filter(f => !f.hasContent)

  return (
    <phase-content>
      <summary>Auditing {files.length} root .md files</summary>

      <If condition={emptyFiles.length > 0}>
        <Step name="Delete empty files">
          <Claude>
            {`Delete empty .md files:
              ${emptyFiles.map(f => `rm ${f.path}`).join('\n')}`}
          </Claude>
        </Step>
      </If>

      <Step name="Cleanup stale content">
        <Claude>
          {`Review and clean up stale content in root .md files:
            - TODO.md: Remove completed sections
            - State.md: Update with current state
            - PROMPT.md: Check for outdated prompts
            
            Delete any files that are now empty.`}
        </Claude>
      </Step>
    </phase-content>
  )
}

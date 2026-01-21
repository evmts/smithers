#!/usr/bin/env bun
/**
 * Docs Review Script
 *
 * Daily cron job that reviews all documentation for correctness.
 * Creates a PR if docs are found to be out of sync with the codebase.
 *
 * Notes:
 * - Allows for unimplemented features to exist in docs
 * - Only flags docs that are factually incorrect about current code
 */

import * as fs from 'fs'
import { SmithersProvider } from '../src/components/SmithersProvider.js'
import { Claude } from '../src/components/Claude.js'
import { Phase } from '../src/components/Phase.js'
import { Step } from '../src/components/Step.js'
import { PhaseRegistryProvider } from '../src/components/PhaseRegistry.js'
import { createSmithersDB } from '../src/db/index.js'
import { createSmithersRoot } from '../src/reconciler/index.js'

const BRANCH_NAME = `docs/auto-review-${new Date().toISOString().slice(0, 10)}`
const OUTPUT_DIR = '.smithers'
const RESULT_PATH = `${OUTPUT_DIR}/docs-review-result.json`
const ALLOW_GITHUB_WRITE = process.env['ALLOW_GITHUB_WRITE'] === 'true'

interface ReviewResult {
  needsChanges: boolean
  filesChanged: string[]
  summary: string
}

let reviewResult: ReviewResult = {
  needsChanges: false,
  filesChanged: [],
  summary: 'No changes needed',
}

function DocsReviewOrchestration() {
  return (
    <PhaseRegistryProvider>
      {/* Phase 1: Analyze docs for correctness */}
      <Phase
        name="analyze"
        onStart={() => console.log('[DocsReview] Phase started: analyze')}
        onComplete={() => console.log('[DocsReview] Phase complete: analyze')}
      >
        <Step
          name="review-docs"
          onStart={() => console.log('[DocsReview] Step started: review-docs')}
          onComplete={() => console.log('[DocsReview] Step complete: review-docs')}
        >
          <Claude
            model="opus"
            permissionMode="bypassPermissions"
            maxTurns={50}
            timeout={1800000}
            onProgress={(msg) => console.log('[DocsReview]', msg)}
            onFinished={(result) => {
              try {
                const parsed = JSON.parse(result.output)
                reviewResult = parsed
                console.log('[DocsReview] Agent complete:', reviewResult.summary)
                console.log('[Result] Needs changes:', reviewResult.needsChanges)
                console.log('[Result] Files changed:', reviewResult.filesChanged.length)
              } catch {
                reviewResult = {
                  needsChanges: false,
                  filesChanged: [],
                  summary: result.output.slice(0, 500),
                }
                console.log('[DocsReview] Agent complete (non-JSON output)')
              }
            }}
            onError={(err) => {
              console.error('[DocsReview] Error: Docs review failed', err)
            }}
          >
            {`## Task
Review ALL documentation in the \`docs/\` directory for correctness against the actual codebase.

## Important Guidelines
1. **Allow unimplemented features** - It's OK for docs to describe planned features not yet implemented
2. **Flag factual errors** - Only flag docs that make incorrect claims about current code behavior
3. **Check API accuracy** - Verify props, methods, function signatures match the code
4. **Check examples** - Ensure code examples would actually work with current implementation

## Steps

1. List all documentation files:
   find docs -name "*.mdx" -o -name "*.md" | head -100

2. For each doc file, read it and verify claims against the source code:
   - Check component props match actual TypeScript types
   - Check method signatures are correct
   - Check example code would compile/run
   - Verify behavioral descriptions match implementation

3. If you find errors, fix them directly in the doc files

4. After all reviews, respond with JSON:
{
  "needsChanges": boolean,
  "filesChanged": ["list", "of", "changed", "files"],
  "summary": "Brief description of what was fixed"
}

Focus on docs/components/, docs/api-reference/, docs/guides/ first.
Skip internal design docs (tui-*.md, refactor-*.md) as they're for dev notes.`}
          </Claude>
        </Step>
      </Phase>

      {/* Phase 2: Create PR if changes were made */}
      <Phase
        name="create-pr"
        skipIf={() => {
          if (!ALLOW_GITHUB_WRITE) {
            console.log('[DocsReview] Phase skipped: create-pr (ALLOW_GITHUB_WRITE not set)')
            return true
          }
          return false
        }}
        onStart={() => console.log('[DocsReview] Phase started: create-pr')}
        onComplete={() => console.log('[DocsReview] Phase complete: create-pr')}
      >
        <Step
          name="git-pr"
          onStart={() => console.log('[DocsReview] Step started: git-pr')}
          onComplete={() => console.log('[DocsReview] Step complete: git-pr')}
        >
          <Claude
            model="sonnet"
            permissionMode="bypassPermissions"
            maxTurns={10}
            onProgress={(msg) => console.log('[DocsReview]', msg)}
            onFinished={async (result) => {
              console.log('[DocsReview] Agent complete: PR step')
              console.log('[PR] Result:', result.output.slice(0, 200))
            }}
          >
            {`Check if any documentation files were changed.

1. Check git status:
   git status --porcelain docs/

2. If there are changes:
   a. Create a new branch:
      git checkout -b ${BRANCH_NAME}

   b. Stage and commit the changes:
      git add docs/
      git commit -m "docs: auto-fix documentation errors

Automated daily review found and fixed documentation inconsistencies.

Summary: ${reviewResult.summary}"

   c. Push the branch:
      git push origin ${BRANCH_NAME}

   d. Create a PR using GitHub CLI:
      gh pr create \\
        --title "docs: automated documentation fixes" \\
        --body "## Automated Documentation Review

This PR was created by the daily documentation review workflow.

### Summary
${reviewResult.summary}

### Files Changed
${reviewResult.filesChanged.map(f => `- ${f}`).join('\n') || 'See diff for details'}

---
*Generated by Smithers docs-review workflow*" \\
        --base main

3. If no changes, output "No documentation changes needed"`}
          </Claude>
        </Step>
      </Phase>
    </PhaseRegistryProvider>
  )
}

async function main() {
  console.log('='.repeat(60))
  console.log('SMITHERS DOCUMENTATION REVIEW')
  console.log('='.repeat(60))
  console.log(`[Info] Date: ${new Date().toISOString()}`)
  console.log(`[Info] Branch: ${BRANCH_NAME}`)
  console.log('')

  const db = createSmithersDB({ path: ':memory:' })
  const executionId = db.execution.start('docs-review', 'scripts/docs-review.tsx')

  const root = createSmithersRoot()

  await root.mount(() => (
    <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
      <orchestration name="docs-review">
        <DocsReviewOrchestration />
      </orchestration>
    </SmithersProvider>
  ))

  console.log('\n' + '='.repeat(60))
  console.log('FINAL RESULT')
  console.log('='.repeat(60))
  console.log(JSON.stringify(reviewResult, null, 2))

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }
  await Bun.write(RESULT_PATH, JSON.stringify(reviewResult, null, 2))
  console.log(`[Info] Wrote review result: ${RESULT_PATH}`)

  console.log('\n' + '='.repeat(60))
  console.log('ORCHESTRATION XML')
  console.log('='.repeat(60) + '\n')
  console.log(root.toXML())

  db.execution.complete(executionId)
  db.close()
}

main().catch(err => {
  console.error('[DocsReview] Error: Docs review failed', err)
  process.exit(1)
})

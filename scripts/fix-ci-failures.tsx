#!/usr/bin/env bun
/**
 * Fix CI Failures Script
 * 
 * Deploys Codex agent to automatically fix CI failures:
 * - Typecheck errors
 * - Lint errors
 * - Test failures
 */

import { SmithersProvider } from '../src/components/SmithersProvider.js'
import { Claude } from '../src/components/Claude.js'
import { Phase } from '../src/components/Phase.js'
import { Step } from '../src/components/Step.js'
import { PhaseRegistry } from '../src/components/PhaseRegistry.js'
import { createSmithersDB } from '../src/db/index.js'
import { createSmithersRoot } from '../src/reconciler/index.js'

const TYPECHECK_FAILED = process.env.TYPECHECK_FAILED === 'true'
const LINT_FAILED = process.env.LINT_FAILED === 'true'
const TEST_FAILED = process.env.TEST_FAILED === 'true'

async function readErrorOutput(filename: string): Promise<string> {
  try {
    return await Bun.file(filename).text()
  } catch {
    return ''
  }
}

function FixCIOrchestration({ typecheckErrors, lintErrors, testErrors }: {
  typecheckErrors: string
  lintErrors: string
  testErrors: string
}) {
  const failures: string[] = []
  if (TYPECHECK_FAILED) failures.push('typecheck')
  if (LINT_FAILED) failures.push('lint')
  if (TEST_FAILED) failures.push('test')

  return (
    <PhaseRegistry>
      <Phase name="fix-failures">
        <Step name="codex-fix">
          <Claude
            model="sonnet"
            permissionMode="bypassPermissions"
            maxTurns={30}
            timeout={600000}
            onFinished={(result) => {
              console.log('Codex fix complete:', result.output.slice(0, 500))
            }}
            onError={(err) => {
              console.error('Codex fix failed:', err.message)
            }}
          >
            {`You are a Codex-style agent that fixes CI failures automatically.

## CI Failures to Fix
${failures.map(f => `- ${f}`).join('\n')}

${TYPECHECK_FAILED ? `## Typecheck Errors
\`\`\`
${typecheckErrors.slice(0, 5000)}
\`\`\`
` : ''}

${LINT_FAILED ? `## Lint Errors
\`\`\`
${lintErrors.slice(0, 5000)}
\`\`\`
` : ''}

${TEST_FAILED ? `## Test Failures
\`\`\`
${testErrors.slice(0, 5000)}
\`\`\`
` : ''}

## Instructions

1. Analyze each error carefully
2. Fix the issues in the source files
3. After each fix, verify by running the check:
   - Typecheck: bun run typecheck
   - Lint: bun run lint
   - Test: bun test

4. Continue until all checks pass or you've made a reasonable attempt

## Guidelines
- Make minimal, targeted fixes
- Don't refactor unrelated code
- If a fix is unclear, leave a TODO comment
- Prefer fixing root causes over suppressing errors
- For test failures, fix the code not the test (unless the test is wrong)

Start by understanding the errors, then fix them systematically.`}
          </Claude>
        </Step>
      </Phase>

      <Phase name="verify">
        <Step name="final-check">
          <Claude
            model="sonnet"
            permissionMode="bypassPermissions"
            maxTurns={5}
            onFinished={(result) => {
              console.log('Verification complete:', result.output.slice(0, 200))
            }}
          >
            {`Run all CI checks to verify fixes:

1. bun run typecheck
2. bun run lint
3. bun test

Report which checks now pass and which still fail (if any).
Output a brief summary of what was fixed.`}
          </Claude>
        </Step>
      </Phase>
    </PhaseRegistry>
  )
}

async function main() {
  if (!TYPECHECK_FAILED && !LINT_FAILED && !TEST_FAILED) {
    console.log('No CI failures to fix')
    return
  }

  const typecheckErrors = await readErrorOutput('typecheck-output.txt')
  const lintErrors = await readErrorOutput('lint-output.txt')
  const testErrors = await readErrorOutput('test-output.txt')

  const db = createSmithersDB({ path: ':memory:' })
  const executionId = db.execution.start('fix-ci-failures', 'scripts/fix-ci-failures.tsx')

  console.log('Starting CI fix...')
  console.log('Failures:', { TYPECHECK_FAILED, LINT_FAILED, TEST_FAILED })

  const root = createSmithersRoot()

  await root.mount(() => (
    <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
      <orchestration name="fix-ci-failures">
        <FixCIOrchestration
          typecheckErrors={typecheckErrors}
          lintErrors={lintErrors}
          testErrors={testErrors}
        />
      </orchestration>
    </SmithersProvider>
  ))

  console.log('\nFix complete!')
  console.log(root.toXML())

  db.execution.complete(executionId)
  db.close()
}

main().catch(err => {
  console.error('CI fix failed:', err)
  process.exit(1)
})

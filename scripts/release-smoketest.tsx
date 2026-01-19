#!/usr/bin/env bun
/**
 * Release Smoketest Script
 *
 * Multi-phase orchestration that:
 * 1. Analyzes git history + notes to understand new features
 * 2. Creates a fresh project from npm
 * 3. Runs smoke tests on basic + new features
 *
 * Each phase returns structured data for the next phase.
 */

import * as fs from 'fs'
import * as path from 'path'
import { z } from 'zod'
import { SmithersProvider } from '../src/components/SmithersProvider.js'
import { Claude } from '../src/components/Claude.js'
import { Phase } from '../src/components/Phase.js'
import { Step } from '../src/components/Step.js'
import { PhaseRegistryProvider } from '../src/components/PhaseRegistry.js'
import { createSmithersDB } from '../src/db/index.js'
import { createSmithersRoot } from '../src/reconciler/index.js'
import { ProgressLogger } from '../src/utils/progress-logger.js'

const VERSION = process.env['SMITHERS_VERSION'] ?? 'latest'
const GIT_HISTORY = process.env['GIT_HISTORY'] ?? '[]'

// Progress logger for visibility
const progress = new ProgressLogger({
  prefix: '[Smoketest]',
  heartbeatInterval: 30000, // Log every 30s
})

// Structured output schemas for phase data passing
const FeatureAnalysisSchema = z.object({
  newFeatures: z.array(z.object({
    name: z.string(),
    description: z.string(),
    testStrategy: z.string(),
    relatedCommits: z.array(z.string()),
    userPrompts: z.array(z.string()).optional(),
  })),
  breakingChanges: z.array(z.object({
    description: z.string(),
    migrationPath: z.string(),
  })),
  coreComponentsModified: z.array(z.string()),
  summary: z.string(),
})

const ProjectSetupSchema = z.object({
  projectPath: z.string(),
  packageJsonValid: z.boolean(),
  smithersVersion: z.string(),
  dependenciesInstalled: z.boolean(),
  errors: z.array(z.string()),
})

const SmoketestResultSchema = z.object({
  basicTests: z.array(z.object({
    name: z.string(),
    passed: z.boolean(),
    output: z.string().optional(),
    error: z.string().optional(),
  })),
  featureTests: z.array(z.object({
    featureName: z.string(),
    passed: z.boolean(),
    output: z.string().optional(),
    error: z.string().optional(),
  })),
  overallSuccess: z.boolean(),
  summary: z.string(),
})

type FeatureAnalysis = z.infer<typeof FeatureAnalysisSchema>
type ProjectSetup = z.infer<typeof ProjectSetupSchema>
type SmoketestResult = z.infer<typeof SmoketestResultSchema>

// State container for phase data
const phaseData: {
  featureAnalysis: FeatureAnalysis | null
  projectSetup: ProjectSetup | null
  smoketestResult: SmoketestResult | null
} = {
  featureAnalysis: null,
  projectSetup: null,
  smoketestResult: null,
}

function AnalyzeHistoryPhase() {
  return (
    <Phase
      name="analyze-history"
      onStart={() => progress.phaseStart('analyze-history')}
      onComplete={() => progress.phaseComplete('analyze-history')}
    >
      <Step
        name="parse-git-history"
        onStart={() => progress.stepStart('parse-git-history')}
        onComplete={() => progress.stepComplete('parse-git-history')}
      >
        <Claude
          model="opus"
          permissionMode="default"
          maxTurns={10}
          schema={FeatureAnalysisSchema}
          schemaRetries={3}
          onProgress={(msg) => progress.agentProgress(msg)}
          onFinished={(result) => {
            if (result.structured) {
              phaseData.featureAnalysis = result.structured as FeatureAnalysis
              progress.agentComplete('opus', phaseData.featureAnalysis.summary)
              console.log('[Result] Features found:', phaseData.featureAnalysis.newFeatures.length)
            }
          }}
          onError={(err) => {
            progress.error('Feature analysis failed', err)
          }}
        >
          {`Analyze the git history to understand what new features were added since the last release.

## Git History (commits since last release)
\`\`\`json
${GIT_HISTORY}
\`\`\`

## Instructions

1. Parse each commit hash and subject
2. Identify from commit messages:
   - New features and capabilities (feat: commits)
   - Bug fixes (fix: commits)
   - Breaking changes
   - Core components that were modified
3. For each new feature, determine a test strategy

Focus on user-facing changes that should be smoke tested.
Return structured data about what to test.`}
        </Claude>
      </Step>
    </Phase>
  )
}

function SetupProjectPhase() {
  return (
    <Phase
      name="setup-project"
      onStart={() => progress.phaseStart('setup-project')}
      onComplete={() => progress.phaseComplete('setup-project')}
    >
      <Step
        name="create-test-project"
        onStart={() => progress.stepStart('create-test-project')}
        onComplete={() => progress.stepComplete('create-test-project')}
      >
        <Claude
          model="opus"
          permissionMode="bypassPermissions"
          maxTurns={15}
          schema={ProjectSetupSchema}
          schemaRetries={3}
          onProgress={(msg) => progress.agentProgress(msg)}
          onFinished={(result) => {
            if (result.structured) {
              phaseData.projectSetup = result.structured as ProjectSetup
              progress.agentComplete('opus', `Project at ${phaseData.projectSetup.projectPath}`)
              console.log('[Result] Dependencies installed:', phaseData.projectSetup.dependenciesInstalled)
            }
          }}
          onError={(err) => {
            progress.error('Project setup failed', err)
          }}
        >
          {`Create a fresh test project that installs smithers from npm.

## Target Version
smithers-orchestrator@${VERSION}

## Instructions

1. Create a new directory: smoketest-project/
2. Initialize with: cd smoketest-project && bun init -y
3. Install smithers: bun add smithers-orchestrator@${VERSION}
4. Verify installation by checking node_modules/smithers-orchestrator exists
5. Create a basic tsconfig.json for TypeScript support

Report the results including any errors encountered.`}
        </Claude>
      </Step>
    </Phase>
  )
}

function RunSmoketestsPhase() {
  const features = phaseData.featureAnalysis
  const setup = phaseData.projectSetup

  return (
    <Phase
      name="run-smoketests"
      skipIf={() => {
        if (!setup?.dependenciesInstalled) {
          progress.phaseSkipped('run-smoketests', 'dependencies not installed')
          return true
        }
        return false
      }}
      onStart={() => progress.phaseStart('run-smoketests')}
      onComplete={() => progress.phaseComplete('run-smoketests')}
    >
      <Step
        name="execute-tests"
        onStart={() => progress.stepStart('execute-tests')}
        onComplete={() => progress.stepComplete('execute-tests')}
      >
        <Claude
          model="opus"
          permissionMode="bypassPermissions"
          maxTurns={30}
          timeout={600000}
          schema={SmoketestResultSchema}
          schemaRetries={3}
          onProgress={(msg) => progress.agentProgress(msg)}
          onFinished={(result) => {
            if (result.structured) {
              phaseData.smoketestResult = result.structured as SmoketestResult
              const passed = phaseData.smoketestResult.basicTests.filter(t => t.passed).length
              const total = phaseData.smoketestResult.basicTests.length
              progress.agentComplete('opus', `${passed}/${total} tests passed`)
              console.log('[Result] Overall success:', phaseData.smoketestResult.overallSuccess)

              if (!phaseData.smoketestResult.overallSuccess) {
                progress.error('SMOKETEST FAILED')
                process.exitCode = 1
              }
            }
          }}
          onError={(err) => {
            progress.error('Smoketest execution failed', err)
            process.exitCode = 1
          }}
        >
          {`Run smoke tests in the test project to verify smithers works correctly.

## Project Path
${setup?.projectPath ?? 'smoketest-project'}

## New Features to Test
${features ? JSON.stringify(features.newFeatures, null, 2) : 'No specific features identified'}

## Basic Tests (always run)

1. **Import Test**: Create a file that imports smithers components
   \`\`\`tsx
   import { SmithersProvider, Claude, Phase, Step } from 'smithers-orchestrator'
   console.log('Import successful')
   \`\`\`

2. **JSX Runtime Test**: Verify JSX compiles correctly
   \`\`\`tsx
   import { SmithersProvider } from 'smithers-orchestrator'
   const element = <SmithersProvider db={null as any} executionId="test">{null}</SmithersProvider>
   console.log('JSX works:', typeof element)
   \`\`\`

3. **Type Check**: Run bun typecheck if tsconfig exists

## Feature Tests

For each new feature identified:
1. Create a minimal test file that exercises the feature
2. Run the test file with bun
3. Verify expected behavior

## Instructions

1. Navigate to the test project
2. Create test files for each test case
3. Execute each test with: bun <test-file>.tsx
4. Record pass/fail and any output/errors
5. Clean up test files after running

Report comprehensive results.`}
        </Claude>
      </Step>
    </Phase>
  )
}

function ReportPhase() {
  return (
    <Phase
      name="report"
      onStart={() => progress.phaseStart('report')}
      onComplete={() => progress.phaseComplete('report')}
    >
      <Step
        name="generate-report"
        onStart={() => progress.stepStart('generate-report')}
        onComplete={() => progress.stepComplete('generate-report')}
      >
        <Claude
          model="sonnet"
          permissionMode="default"
          maxTurns={5}
          onProgress={(msg) => progress.agentProgress(msg)}
          onFinished={(result) => {
            progress.agentComplete('sonnet', 'Report generated')
            console.log('\n' + '='.repeat(60))
            console.log('SMOKETEST REPORT')
            console.log('='.repeat(60) + '\n')
            console.log(result.output)
          }}
        >
          {`Generate a final smoketest report.

## Feature Analysis
${JSON.stringify(phaseData.featureAnalysis, null, 2)}

## Project Setup
${JSON.stringify(phaseData.projectSetup, null, 2)}

## Test Results
${JSON.stringify(phaseData.smoketestResult, null, 2)}

Create a concise markdown report summarizing:
1. What was tested
2. Pass/fail status for each test
3. Any failures or issues found
4. Overall verdict (PASS/FAIL)

Keep it brief and actionable.`}
        </Claude>
      </Step>
    </Phase>
  )
}

function ReleaseSmoketestOrchestration() {
  return (
    <PhaseRegistryProvider>
      <AnalyzeHistoryPhase />
      <SetupProjectPhase />
      <RunSmoketestsPhase />
      <ReportPhase />
    </PhaseRegistryProvider>
  )
}

async function main() {
  console.log('='.repeat(60))
  console.log(`SMITHERS RELEASE SMOKETEST v${VERSION}`)
  console.log('='.repeat(60))

  let historyEntries = 0
  try {
    historyEntries = JSON.parse(GIT_HISTORY).length
  } catch {
    console.warn('[Warning] Could not parse GIT_HISTORY, using empty array')
  }
  console.log(`[Info] Git history entries: ${historyEntries}`)
  console.log(`[Info] Target version: smithers-orchestrator@${VERSION}`)
  console.log('')

  // Ensure .smithers directory exists
  const dbDir = '.smithers'
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  const db = createSmithersDB({ path: path.join(dbDir, 'smoketest.db') })
  const executionId = db.execution.start('release-smoketest', 'scripts/release-smoketest.tsx')

  // Start heartbeat for visibility
  progress.startHeartbeat()

  const root = createSmithersRoot()

  try {
    await root.mount(() => (
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <orchestration name="release-smoketest" version={VERSION}>
          <ReleaseSmoketestOrchestration />
        </orchestration>
      </SmithersProvider>
    ))
  } finally {
    // Always show summary and stop heartbeat
    progress.summary()
  }

  console.log('\n' + '='.repeat(60))
  console.log('ORCHESTRATION XML OUTPUT')
  console.log('='.repeat(60) + '\n')
  console.log(root.toXML())

  db.execution.complete(executionId)
  db.close()

  // Exit with proper code
  process.exit(process.exitCode ?? 0)
}

main().catch(err => {
  progress.error('Release smoketest failed', err)
  progress.summary()
  process.exit(1)
})

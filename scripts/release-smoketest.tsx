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

import { z } from 'zod'
import { SmithersProvider } from '../src/components/SmithersProvider.js'
import { Claude } from '../src/components/Claude.js'
import { Phase } from '../src/components/Phase.js'
import { Step } from '../src/components/Step.js'
import { PhaseRegistryProvider } from '../src/components/PhaseRegistry.js'
import { createSmithersDB } from '../src/db/index.js'
import { createSmithersRoot } from '../src/reconciler/index.js'

const VERSION = process.env['SMITHERS_VERSION'] ?? 'latest'
const GIT_HISTORY = process.env['GIT_HISTORY'] ?? '[]'

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
    <Phase name="analyze-history">
      <Step name="parse-git-history">
        <Claude
          model="opus"
          permissionMode="default"
          maxTurns={10}
          schema={FeatureAnalysisSchema}
          schemaRetries={3}
          onFinished={(result) => {
            if (result.structured) {
              phaseData.featureAnalysis = result.structured as FeatureAnalysis
              console.log('Feature analysis complete:', phaseData.featureAnalysis.summary)
            }
          }}
          onError={(err) => {
            console.error('Feature analysis failed:', err.message)
          }}
        >
          {`Analyze the git history with notes to understand what new features were added since the last release.

## Git History (with notes containing original user prompts)
\`\`\`json
${GIT_HISTORY}
\`\`\`

## Instructions

1. Parse each commit and its associated git notes
2. The notes often contain "User prompt:" which is the original request that led to the change
3. Identify:
   - New features and capabilities
   - Breaking changes
   - Core components that were modified
4. For each new feature, determine a test strategy

Focus on user-facing changes that should be smoke tested.
Return structured data about what to test.`}
        </Claude>
      </Step>
    </Phase>
  )
}

function SetupProjectPhase() {
  return (
    <Phase name="setup-project">
      <Step name="create-test-project">
        <Claude
          model="opus"
          permissionMode="bypassPermissions"
          maxTurns={15}
          schema={ProjectSetupSchema}
          schemaRetries={3}
          onFinished={(result) => {
            if (result.structured) {
              phaseData.projectSetup = result.structured as ProjectSetup
              console.log('Project setup:', phaseData.projectSetup.projectPath)
            }
          }}
          onError={(err) => {
            console.error('Project setup failed:', err.message)
          }}
        >
          {`Create a fresh test project that installs smithers from npm.

## Target Version
smithers@${VERSION}

## Instructions

1. Create a new directory: smoketest-project/
2. Initialize with: cd smoketest-project && bun init -y
3. Install smithers: bun add smithers@${VERSION}
4. Verify installation by checking node_modules/smithers exists
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
      skipIf={() => !setup?.dependenciesInstalled}
    >
      <Step name="execute-tests">
        <Claude
          model="opus"
          permissionMode="bypassPermissions"
          maxTurns={30}
          timeout={600000}
          schema={SmoketestResultSchema}
          schemaRetries={3}
          onFinished={(result) => {
            if (result.structured) {
              phaseData.smoketestResult = result.structured as SmoketestResult
              console.log('Smoketest result:', phaseData.smoketestResult.summary)
              
              if (!phaseData.smoketestResult.overallSuccess) {
                console.error('SMOKETEST FAILED')
                process.exitCode = 1
              }
            }
          }}
          onError={(err) => {
            console.error('Smoketest execution failed:', err.message)
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
   import { SmithersProvider, Claude, Phase, Step } from 'smithers'
   console.log('Import successful')
   \`\`\`

2. **JSX Runtime Test**: Verify JSX compiles correctly
   \`\`\`tsx
   import { SmithersProvider } from 'smithers'
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
    <Phase name="report">
      <Step name="generate-report">
        <Claude
          model="sonnet"
          permissionMode="default"
          maxTurns={5}
          onFinished={(result) => {
            console.log('\n=== SMOKETEST REPORT ===\n')
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
  console.log(`Starting release smoketest for smithers@${VERSION}`)
  console.log('Git history entries:', JSON.parse(GIT_HISTORY).length)

  const db = createSmithersDB({ path: '.smithers/smoketest.db' })
  const executionId = db.execution.start('release-smoketest', 'scripts/release-smoketest.tsx')

  const root = createSmithersRoot()

  await root.mount(() => (
    <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
      <orchestration name="release-smoketest" version={VERSION}>
        <ReleaseSmoketestOrchestration />
      </orchestration>
    </SmithersProvider>
  ))

  console.log('\n=== ORCHESTRATION OUTPUT ===\n')
  console.log(root.toXML())

  db.execution.complete(executionId)
  db.close()

  // Exit with proper code
  process.exit(process.exitCode ?? 0)
}

main().catch(err => {
  console.error('Release smoketest failed:', err)
  process.exit(1)
})

#!/usr/bin/env bun
import { Claude, executePlan, Worktree, Subagent } from '../../src'
import { create } from 'zustand'

/**
 * Parallel Worktrees Example
 *
 * Demonstrates:
 * - Multiple agents working on different branches simultaneously
 * - Git worktree isolation
 * - Parallel execution with Subagent
 * - Coordinated multi-feature development
 */

interface WorktreeState {
  features: Array<{
    name: string
    branch: string
    status: 'pending' | 'in_progress' | 'complete' | 'error'
    result?: string
  }>
  updateFeatureStatus: (name: string, status: any, result?: string) => void
}

const useStore = create<WorktreeState>((set) => ({
  features: [],
  updateFeatureStatus: (name, status, result) =>
    set((state) => ({
      features: state.features.map((f) =>
        f.name === name ? { ...f, status, result } : f
      ),
    })),
}))

function ParallelWorktrees({ features }: { features: string[] }) {
  const { updateFeatureStatus } = useStore()

  // Initialize features in store
  if (useStore.getState().features.length === 0) {
    useStore.setState({
      features: features.map((name) => ({
        name,
        branch: `feature/${name.toLowerCase().replace(/\s+/g, '-')}`,
        status: 'pending',
      })),
    })
  }

  const featureList = useStore.getState().features

  return (
    <>
      {featureList.map((feature) => (
        <Subagent key={feature.name} name={feature.name} parallel>
          <Worktree
            path={`./worktrees/${feature.branch}`}
            branch={feature.branch}
            cleanup={false} // Keep worktrees for review
            onCreated={() => {
              console.log(`✓ Created worktree: ${feature.branch}`)
              updateFeatureStatus(feature.name, 'in_progress')
            }}
            onCleanup={() => {
              console.log(`✓ Cleaned up worktree: ${feature.branch}`)
            }}
          >
            <Claude
              allowedTools={['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']}
              onFinished={(result) => {
                updateFeatureStatus(feature.name, 'complete', result.text)
              }}
              onError={(error) => {
                updateFeatureStatus(feature.name, 'error', error.message)
              }}
            >
              Implement feature: {feature.name}

              You are working in an isolated git worktree at: ./worktrees/{feature.branch}

              Steps:
              1. Research the codebase to understand where this feature belongs
              2. Create or modify necessary files
              3. Write or update tests for the feature
              4. Run tests to verify functionality
              5. Stage and commit changes with a descriptive message

              Requirements:
              - Follow existing code patterns
              - Ensure tests pass
              - Write clear commit messages
              - Document any new APIs

              Report back with:
              - Files changed
              - Tests added/modified
              - Commit hash
              - Any issues or concerns
            </Claude>
          </Worktree>
        </Subagent>
      ))}
    </>
  )
}

// Main execution
const features = process.argv.slice(2)

if (features.length === 0) {
  console.error('❌ Usage: bun run agent.tsx <feature1> [feature2] [feature3] ...')
  console.error('')
  console.error('Example:')
  console.error('  bun run agent.tsx "Add dark mode" "Fix mobile layout" "Improve search"')
  process.exit(1)
}

console.log('🔀 Parallel Worktrees Starting')
console.log(`  Features: ${features.length}`)
features.forEach((f, i) => console.log(`  ${i + 1}. ${f}`))
console.log()

const startTime = Date.now()

const result = await executePlan(<ParallelWorktrees features={features} />, {
  mockMode: process.env.SMITHERS_MOCK === 'true',
})

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
const { features: completedFeatures } = useStore.getState()

console.log()
console.log('✅ Parallel Development Complete')
console.log(`  Time: ${elapsed}s`)
console.log(`  Features: ${completedFeatures.length}`)
console.log()

// Summary
completedFeatures.forEach((feature) => {
  const icon = feature.status === 'complete' ? '✓' : feature.status === 'error' ? '✗' : '○'
  console.log(`${icon} ${feature.name} (${feature.branch})`)

  if (feature.status === 'complete') {
    console.log(`    Status: Ready for review`)
  } else if (feature.status === 'error') {
    console.log(`    Error: ${feature.result}`)
  }
})

console.log()
console.log('Next steps:')
console.log('  1. Review changes in each worktree')
console.log('  2. Run tests: bun test')
console.log('  3. Create pull requests for completed features')
console.log('  4. Clean up worktrees: git worktree remove <path>')

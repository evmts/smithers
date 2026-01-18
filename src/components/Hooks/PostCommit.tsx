// PostCommit hook component - triggers children when a git commit is made
// Installs a git post-commit hook and polls db.state for triggers

import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider'
import { useMount, useUnmount } from '../../reconciler/hooks'

export interface PostCommitProps {
  children: ReactNode
  /**
   * Filter which commits trigger the hook
   * - 'all': All commits trigger
   * - 'smithers-only': Only commits with smithers metadata in git notes
   */
  runOn?: 'all' | 'smithers-only'
  /**
   * Run children in background (non-blocking)
   */
  async?: boolean
}

interface HookTrigger {
  type: 'post-commit'
  commitHash: string
  timestamp: number
  processed?: boolean
}

/**
 * Install the git post-commit hook
 */
async function installPostCommitHook(): Promise<void> {
  const hookPath = '.git/hooks/post-commit'
  const hookContent = `#!/bin/bash
COMMIT_HASH=$(git rev-parse HEAD)
bunx smithers hook-trigger post-commit "$COMMIT_HASH"
`
  await Bun.write(hookPath, hookContent)
  await Bun.$`chmod +x ${hookPath}`
}

/**
 * Check if a commit has smithers metadata in git notes
 */
async function hasSmithersMetadata(commitHash: string): Promise<boolean> {
  try {
    const result = await Bun.$`git notes show ${commitHash} 2>/dev/null`.text()
    return result.toLowerCase().includes('smithers') || result.toLowerCase().includes('user prompt:')
  } catch {
    return false
  }
}

/**
 * PostCommit - Hook component that triggers on git commits
 *
 * On mount, installs a git post-commit hook that calls:
 *   bunx smithers hook-trigger post-commit "$COMMIT_HASH"
 *
 * Then polls db.state for 'last_hook_trigger' to detect new commits.
 * When a commit is detected, renders children.
 *
 * Usage:
 * ```tsx
 * <PostCommit runOn="smithers-only">
 *   <Claude>Review the latest commit and suggest improvements</Claude>
 * </PostCommit>
 * ```
 */
export function PostCommit(props: PostCommitProps): ReactNode {
  const smithers = useSmithers()

  const [triggered, setTriggered] = useState(false)
  const [currentTrigger, setCurrentTrigger] = useState<HookTrigger | null>(null)
  const lastProcessedTimestampRef = useRef(0)
  const [hookInstalled, setHookInstalled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const taskIdRef = useRef<string | null>(null)

  useMount(() => {
    // Fire-and-forget async IIFE pattern
    ;(async () => {
      try {
        // Install the git hook
        await installPostCommitHook()
        setHookInstalled(true)

        // Start polling for triggers
        pollIntervalRef.current = setInterval(async () => {
          try {
            const trigger = await smithers.db.state.get<HookTrigger>('last_hook_trigger')

            if (trigger && trigger.type === 'post-commit' && trigger.timestamp > lastProcessedTimestampRef.current) {
              // Check filter conditions
              let shouldTrigger = true

              if (props.runOn === 'smithers-only') {
                shouldTrigger = await hasSmithersMetadata(trigger.commitHash)
              }

              if (shouldTrigger) {
                setCurrentTrigger(trigger)
                lastProcessedTimestampRef.current = trigger.timestamp
                setTriggered(true)

                // Mark as processed in db
                await smithers.db.state.set('last_hook_trigger', {
                  ...trigger,
                  processed: true,
                }, 'post-commit-hook')

                // If running in background (async), register task
                if (props.async) {
                  taskIdRef.current = smithers.db.tasks.start('post-commit-hook')
                  // Task will be completed when children finish
                  // For now, we complete immediately as children handle their own task registration
                  smithers.db.tasks.complete(taskIdRef.current)
                }
              }
            }
          } catch (pollError) {
            console.error('[PostCommit] Polling error:', pollError)
          }
        }, 1000) // Poll every 1 second

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        setError(errorMsg)
        console.error('[PostCommit] Failed to install hook:', errorMsg)
      }
    })()
  })

  useUnmount(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }
  })

  return (
    <post-commit-hook
      installed={hookInstalled}
      triggered={triggered}
      commit-hash={currentTrigger?.commitHash}
      run-on={props.runOn || 'all'}
      async={props.async || false}
      error={error}
    >
      {triggered ? props.children : null}
    </post-commit-hook>
  )
}

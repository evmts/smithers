// PostCommit hook component - triggers children when a git commit is made
// Installs a git post-commit hook and polls db.state for triggers

import * as path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useUnmount, useExecutionMount, useEffectOnValueChange } from '../../reconciler/hooks.js'
import { useQueryValue } from '../../reactive-sqlite/index.js'
import { useExecutionScope } from '../ExecutionScope.js'
import { makeStateKey } from '../../utils/scope.js'
import { SMITHERS_NOTES_REF } from '../../utils/vcs.js'

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
  const hookPath = (await Bun.$`git rev-parse --git-path hooks/post-commit`.text()).trim()
  if (!hookPath) {
    throw new Error('Failed to resolve git hook path')
  }
  const localHookPath = (await Bun.$`git rev-parse --git-path hooks/post-commit.local`.text()).trim()
  if (!localHookPath) {
    throw new Error('Failed to resolve git local hook path')
  }
  const marker = '# smithers:post-commit'
  const hookContent = `#!/bin/bash
set -euo pipefail
${marker}
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_HOOK="$HOOK_DIR/post-commit.local"
if [ -x "$LOCAL_HOOK" ]; then
  "$LOCAL_HOOK" "$@"
fi
COMMIT_HASH=$(git rev-parse HEAD)
bunx smithers hook-trigger post-commit "$COMMIT_HASH"
`

  await mkdir(path.dirname(hookPath), { recursive: true })

  const existingHook = await Bun.file(hookPath).text().catch(() => null)
  if (existingHook && existingHook.includes(marker)) {
    return
  }

  if (existingHook) {
    let backupPath = localHookPath
    if (await Bun.file(localHookPath).exists()) {
      backupPath = `${localHookPath}.${Date.now()}`
    }
    await Bun.write(backupPath, existingHook)
    await Bun.$`chmod +x ${backupPath}`.quiet()
  }

  await Bun.write(hookPath, hookContent)
  await Bun.$`chmod +x ${hookPath}`.quiet()
}

/**
 * Check if a commit has smithers metadata in git notes
 */
async function hasSmithersMetadata(commitHash: string): Promise<boolean> {
  try {
    const result = await Bun.$`git notes --ref ${SMITHERS_NOTES_REF} show ${commitHash} 2>/dev/null`.text()
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
interface PostCommitState {
  triggered: boolean
  currentTrigger: HookTrigger | null
  hookInstalled: boolean
  error: string | null
  lastProcessedTimestamp: number
}

const DEFAULT_STATE: PostCommitState = {
  triggered: false,
  currentTrigger: null,
  hookInstalled: false,
  error: null,
  lastProcessedTimestamp: 0,
}

export function PostCommit(props: PostCommitProps): ReactNode {
  const { db, reactiveDb, executionEnabled, executionId } = useSmithers()
  const executionScope = useExecutionScope()
  const stateKey = makeStateKey(executionId, 'hook', 'postCommit')
  const lastTriggerKey = makeStateKey(executionId, 'hook', 'lastHookTrigger')

  // Query state from db.state reactively
  const { data: stateJson } = useQueryValue<string>(
    reactiveDb,
    'SELECT value FROM state WHERE key = ?',
    [stateKey]
  )
  const state: PostCommitState = (() => {
    if (!stateJson) {
      return db.state.get<PostCommitState>(stateKey) ?? DEFAULT_STATE
    }
    try { return JSON.parse(stateJson) }
    catch { return DEFAULT_STATE }
  })()
  const { triggered, currentTrigger, hookInstalled, error } = state

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const taskIdRef = useRef<string | null>(null)
  const inFlightRef = useRef(false)

  const shouldExecute = executionEnabled && executionScope.enabled
  useExecutionMount(shouldExecute, () => {
    if (!db || !reactiveDb) return
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }

    // Initialize state if not present
    const currentState = db.state.get<PostCommitState>(stateKey)
    if (!currentState) {
      db.state.set(stateKey, DEFAULT_STATE, 'post-commit-init')
    }

    // Fire-and-forget async IIFE pattern
    ;(async () => {
      try {
        // Install the git hook
        await installPostCommitHook()
        const s = db.state.get<PostCommitState>(stateKey) ?? DEFAULT_STATE
        db.state.set(stateKey, { ...s, hookInstalled: true }, 'post-commit-hook-installed')

        // Start polling for triggers
        pollIntervalRef.current = setInterval(async () => {
          if (inFlightRef.current) return
          inFlightRef.current = true
          try {
            const namespacedTrigger = db.state.get<HookTrigger>(lastTriggerKey)
            const legacyTrigger = namespacedTrigger
              ? null
              : db.state.get<HookTrigger>('last_hook_trigger')
            const trigger = namespacedTrigger ?? legacyTrigger
            const triggerKey = namespacedTrigger ? lastTriggerKey : 'last_hook_trigger'
            const currentS = db.state.get<PostCommitState>(stateKey) ?? DEFAULT_STATE

            if (trigger && trigger.type === 'post-commit' && trigger.timestamp > currentS.lastProcessedTimestamp) {
              // Check filter conditions
              let shouldTrigger = true

              if (props.runOn === 'smithers-only') {
                shouldTrigger = await hasSmithersMetadata(trigger.commitHash)
              }

              if (shouldTrigger) {
                db.state.set(stateKey, {
                  ...currentS,
                  triggered: true,
                  currentTrigger: trigger,
                  lastProcessedTimestamp: trigger.timestamp,
                }, 'post-commit-triggered')

                // Mark as processed in db
                db.state.set(triggerKey, {
                  ...trigger,
                  processed: true,
                }, 'post-commit-hook')

                // If running in background (async), register task
                if (props.async) {
                  taskIdRef.current = db.tasks.start('post-commit-hook', undefined, { scopeId: executionScope.scopeId })
                  // Task will be completed when children finish
                  // For now, we complete immediately as children handle their own task registration
                  db.tasks.complete(taskIdRef.current)
                }
              }
            }
          } catch (pollError) {
            console.error('[PostCommit] Polling error:', pollError)
          } finally {
            inFlightRef.current = false
          }
        }, 1000) // Poll every 1 second

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        const s = db.state.get<PostCommitState>(stateKey) ?? DEFAULT_STATE
        db.state.set(stateKey, { ...s, error: errorMsg }, 'post-commit-error')
        console.error('[PostCommit] Failed to install hook:', errorMsg)
      }
    })()
  }, [db, reactiveDb, executionEnabled, props.async, props.runOn])

  useUnmount(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }
  })

  useEffectOnValueChange(shouldExecute, () => {
    if (shouldExecute) return
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
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
      {triggered && currentTrigger
        ? <post-commit-run key={`${currentTrigger.commitHash}-${currentTrigger.timestamp}`}>{props.children}</post-commit-run>
        : null}
    </post-commit-hook>
  )
}

import * as path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useQueryValue } from '../../reactive-sqlite/index.js'
import { useExecutionScope } from '../ExecutionScope.js'
import { makeStateKey } from '../../utils/scope.js'
import { SMITHERS_NOTES_REF } from '../../utils/vcs.js'
import { usePollingHook } from './usePollingHook.js'

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

async function hasSmithersMetadata(commitHash: string): Promise<boolean> {
  try {
    const result = await Bun.$`git notes --ref ${SMITHERS_NOTES_REF} show ${commitHash} 2>/dev/null`.text()
    return result.toLowerCase().includes('smithers') || result.toLowerCase().includes('user prompt:')
  } catch {
    return false
  }
}

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

  const taskIdRef = useRef<string | null>(null)
  const shouldExecute = executionEnabled && executionScope.enabled && !!db && !!reactiveDb

  usePollingHook({
    shouldExecute,
    intervalMs: 1000,
    immediate: false,
    deps: [props.async, props.runOn],
    onStart: async () => {
      if (!db || !reactiveDb) return

      const currentState = db.state.get<PostCommitState>(stateKey)
      if (!currentState) {
        db.state.set(stateKey, DEFAULT_STATE, 'post-commit-init')
      }

      try {
        await installPostCommitHook()
        const s = db.state.get<PostCommitState>(stateKey) ?? DEFAULT_STATE
        db.state.set(stateKey, { ...s, hookInstalled: true }, 'post-commit-hook-installed')
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        const s = db.state.get<PostCommitState>(stateKey) ?? DEFAULT_STATE
        db.state.set(stateKey, { ...s, error: errorMsg }, 'post-commit-error')
        console.error('[PostCommit] Failed to install hook:', errorMsg)
        throw err
      }
    },
    onTick: async () => {
      if (!db || !reactiveDb) return
      try {
        const namespacedTrigger = db.state.get<HookTrigger>(lastTriggerKey)
        const legacyTrigger = namespacedTrigger
          ? null
          : db.state.get<HookTrigger>('last_hook_trigger')
        const trigger = namespacedTrigger ?? legacyTrigger
        const triggerKey = namespacedTrigger ? lastTriggerKey : 'last_hook_trigger'
        const currentS = db.state.get<PostCommitState>(stateKey) ?? DEFAULT_STATE

        if (trigger && trigger.type === 'post-commit' && trigger.timestamp > currentS.lastProcessedTimestamp) {
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

            db.state.set(triggerKey, {
              ...trigger,
              processed: true,
            }, 'post-commit-hook')

            if (props.async) {
              taskIdRef.current = db.tasks.start('post-commit-hook', undefined, { scopeId: executionScope.scopeId })
              db.tasks.complete(taskIdRef.current)
            }
          }
        }
      } catch (pollError) {
        console.error('[PostCommit] Polling error:', pollError)
      }
    },
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

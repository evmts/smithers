import { useRef, type ReactNode } from 'react'
import * as path from 'node:path'
import { useSmithers } from './SmithersProvider.js'
import { WorktreeProvider, type WorktreeContextValue } from './WorktreeProvider.js'
import { useMount, useUnmount, useMountedState } from '../reconciler/hooks.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { addWorktree, removeWorktree, worktreeExists, branchExists } from '../utils/vcs/git.js'

export interface WorktreeProps {
  branch: string
  base?: string
  path?: string
  cleanup?: boolean
  children: ReactNode
  onReady?: (worktreePath: string) => void
  onError?: (error: Error) => void
}

interface WorktreeState {
  status: 'pending' | 'ready' | 'error'
  path: string | null
  error: string | null
}

export function Worktree(props: WorktreeProps): ReactNode {
  const smithers = useSmithers()
  const opIdRef = useRef(crypto.randomUUID())
  const stateKey = `worktree:${opIdRef.current}`
  const isMounted = useMountedState()

  const { data: storedState } = useQueryValue<string>(
    smithers.db.db,
    "SELECT value FROM state WHERE key = ?",
    [stateKey]
  )
  const state: WorktreeState = (() => {
    const defaultState = { status: 'pending' as const, path: null, error: null }
    if (!storedState) return defaultState
    try { return JSON.parse(storedState) }
    catch { return defaultState }
  })()

  const createdWorktreeRef = useRef(false)
  const taskIdRef = useRef<string | null>(null)

  const setState = (nextState: WorktreeState) => {
    smithers.db.state.set(stateKey, nextState, 'worktree')
  }

  useMount(() => {
    ;(async () => {
      taskIdRef.current = smithers.db.tasks.start('worktree', props.branch)

      try {
        const defaultPath = path.join(process.cwd(), '.worktrees', props.branch)
        const worktreePath = path.resolve(props.path ?? defaultPath)

        const exists = await worktreeExists(worktreePath)
        if (!exists) {
          const hasBranch = await branchExists(props.branch)
          await addWorktree(worktreePath, props.branch, {
            base: props.base ?? 'HEAD',
            createBranch: !hasBranch,
          })
          createdWorktreeRef.current = true
          console.log(`[Worktree] Created worktree at ${worktreePath} for branch ${props.branch}`)
        } else {
          console.log(`[Worktree] Using existing worktree at ${worktreePath}`)
        }

        if (!isMounted()) return
        setState({ status: 'ready', path: worktreePath, error: null })

        // Complete setup task - worktree is ready
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
          taskIdRef.current = null
        }

        props.onReady?.(worktreePath)
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        console.error('[Worktree] Error setting up worktree:', errorObj)
        if (!isMounted()) return
        setState({ status: 'error', path: null, error: errorObj.message })

        // Complete setup task with error
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
          taskIdRef.current = null
        }

        props.onError?.(errorObj)
      }
    })()
  })

  useUnmount(() => {
    ;(async () => {
      if (props.cleanup && createdWorktreeRef.current && state.path) {
        try {
          await removeWorktree(state.path, { force: true })
          console.log(`[Worktree] Removed worktree at ${state.path}`)
        } catch (err) {
          console.warn('[Worktree] Could not remove worktree:', err)
        }
      }
      // Task is already completed in mount - no need to complete here
    })()
  })

  if (state.status === 'pending') {
    return (
      <worktree branch={props.branch} status="pending">
        Setting up worktree...
      </worktree>
    )
  }

  if (state.status === 'error') {
    return (
      <worktree branch={props.branch} status="error" {...(state.error ? { error: state.error } : {})}>
        {state.error ?? 'Failed to set up worktree'}
      </worktree>
    )
  }

  const contextValue: WorktreeContextValue = {
    cwd: state.path ?? '',
    branch: props.branch,
    isWorktree: true,
  }

  return (
    <worktree branch={props.branch} status="ready" {...(state.path ? { path: state.path } : {})}>
      <WorktreeProvider value={contextValue}>
        {props.children}
      </WorktreeProvider>
    </worktree>
  )
}

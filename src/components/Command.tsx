import { useRef, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useMountedState, useExecutionMount } from '../reconciler/hooks.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { useExecutionScope } from './ExecutionScope.js'
import { makeStateKey } from '../utils/scope.js'
import { useWorktree } from './WorktreeProvider.js'

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
  success: boolean
}

interface CommandState {
  status: 'pending' | 'running' | 'complete' | 'error'
  result: CommandResult | null
}

export interface CommandProps {
  /** Command to execute (shell string or array form) */
  cmd: string | string[]
  /** Arguments when cmd is string */
  args?: string[]
  /** Working directory */
  cwd?: string
  /** Environment variables (merged with process.env) */
  env?: Record<string, string>
  /** Timeout in milliseconds */
  timeout?: number
  /** Stable identifier for resumability */
  id?: string
  /** Success callback */
  onFinished?: (result: CommandResult) => void
  /** Error callback */
  onError?: (result: CommandResult) => void
  /** Render function for output handling */
  children?: (result: CommandResult) => ReactNode
}

export function Command(props: CommandProps): ReactNode {
  const smithers = useSmithers()
  const worktree = useWorktree()
  const opIdRef = useRef(props.id ?? crypto.randomUUID())
  const stateKey = makeStateKey(smithers.executionId ?? 'execution', 'command', opIdRef.current)

  const { data: opState } = useQueryValue<string>(
    smithers.db.db,
    "SELECT value FROM state WHERE key = ?",
    [stateKey]
  )
  const defaultState: CommandState = { status: 'pending', result: null }
  const { status, result }: CommandState = (() => {
    if (!opState) return defaultState
    try { return JSON.parse(opState) }
    catch { return defaultState }
  })()

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()
  const executionScope = useExecutionScope()
  const shouldExecute = smithers.executionEnabled && executionScope.enabled

  const setState = (newState: CommandState) => {
    smithers.db.state.set(stateKey, newState, 'command')
  }

  // Resolve cwd: props.cwd takes priority, then worktree context
  const effectiveCwd = props.cwd ?? worktree?.path ?? process.cwd()

  useExecutionMount(shouldExecute, () => {
    ;(async () => {
      if (status !== 'pending') return

      taskIdRef.current = smithers.db.tasks.start('command', undefined, { scopeId: executionScope.scopeId })

      try {
        setState({ status: 'running', result: null })

        const startTime = Date.now()
        const timeout = props.timeout ?? 300000

        let proc: ReturnType<typeof Bun.spawn>
        
        if (Array.isArray(props.cmd)) {
          // Array form: direct execution
          proc = Bun.spawn(props.cmd, {
            cwd: effectiveCwd,
            env: { ...process.env, ...props.env },
            stdout: 'pipe',
            stderr: 'pipe',
          })
        } else if (props.args && props.args.length > 0) {
          // String cmd with args array
          proc = Bun.spawn([props.cmd, ...props.args], {
            cwd: effectiveCwd,
            env: { ...process.env, ...props.env },
            stdout: 'pipe',
            stderr: 'pipe',
          })
        } else {
          // String form: shell execution
          proc = Bun.spawn(['bash', '-c', props.cmd], {
            cwd: effectiveCwd,
            env: { ...process.env, ...props.env },
            stdout: 'pipe',
            stderr: 'pipe',
          })
        }

        // Setup timeout
        const timeoutPromise = new Promise<'timeout'>((resolve) => {
          setTimeout(() => resolve('timeout'), timeout)
        })

        const exitPromise = proc.exited

        const raceResult = await Promise.race([exitPromise, timeoutPromise])

        if (raceResult === 'timeout') {
          proc.kill()
          const commandResult: CommandResult = {
            stdout: '',
            stderr: `Command timed out after ${timeout}ms`,
            exitCode: -1,
            durationMs: Date.now() - startTime,
            success: false,
          }
          setState({ status: 'error', result: commandResult })
          if (isMounted()) {
            props.onError?.(commandResult)
          }
          return
        }

        const exitCode = raceResult
        const stdout = await new Response(proc.stdout).text()
        const stderr = await new Response(proc.stderr).text()
        const durationMs = Date.now() - startTime
        const success = exitCode === 0

        const commandResult: CommandResult = {
          stdout,
          stderr,
          exitCode,
          durationMs,
          success,
        }

        if (success) {
          setState({ status: 'complete', result: commandResult })
          if (isMounted()) {
            props.onFinished?.(commandResult)
          }
        } else {
          setState({ status: 'error', result: commandResult })
          if (isMounted()) {
            props.onError?.(commandResult)
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        const commandResult: CommandResult = {
          stdout: '',
          stderr: errorMessage,
          exitCode: -1,
          durationMs: 0,
          success: false,
        }
        setState({ status: 'error', result: commandResult })
        if (isMounted()) {
          props.onError?.(commandResult)
        }
      } finally {
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  }, [shouldExecute, status])

  // Render children function if result is available
  const childContent = result && props.children ? props.children(result) : null

  return (
    <command
      status={status}
      exit-code={result?.exitCode}
      duration-ms={result?.durationMs}
    >
      {childContent}
    </command>
  )
}

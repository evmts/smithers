import { useRef, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useMountedState, useExecutionMount, useUnmount } from '../reconciler/hooks.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { useExecutionScope } from './ExecutionScope.js'
import { makeStateKey } from '../utils/scope.js'
import { useWorktree } from './WorktreeProvider.js'

/**
 * Validates command input for shell injection risks.
 * Rejects commands containing dangerous shell metacharacters when using shell execution.
 */
function validateShellCommand(cmd: string): void {
  const dangerousPatterns = [
    /[;&|`$]/, // command chaining, substitution
    /\$\(/, // command substitution
    /[<>]/, // redirects
    /\n/, // newlines (command injection)
  ]
  for (const pattern of dangerousPatterns) {
    if (pattern.test(cmd)) {
      throw new Error(
        `Shell injection risk detected in command: "${cmd}". ` +
        `Use array form (cmd: ['program', 'arg1', 'arg2']) for untrusted input.`
      )
    }
  }
}

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
  /**
   * Skip shell injection validation for trusted commands.
   * WARNING: Only set to true for commands from trusted sources (code literals).
   * Never use with user/LLM-supplied input. For untrusted input, use array form.
   */
  trusted?: boolean
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
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMounted = useMountedState()
  const executionScope = useExecutionScope()
  const shouldExecute = smithers.executionEnabled && executionScope.enabled

  // Cleanup timeout on unmount to prevent memory leaks
  useUnmount(() => {
    if (timeoutIdRef.current !== null) {
      clearTimeout(timeoutIdRef.current)
      timeoutIdRef.current = null
    }
  })

  const setState = (newState: CommandState) => {
    smithers.db.state.set(stateKey, newState, 'command')
  }

  // Resolve cwd: props.cwd takes priority, then worktree context
  const effectiveCwd = props.cwd ?? worktree?.cwd ?? process.cwd()

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
          // WARNING: Shell execution with string commands can be dangerous if cmd
          // is user/LLM-supplied. Validate to reject dangerous metacharacters
          // unless trusted=true. Prefer array form for untrusted input.
          if (!props.trusted) {
            validateShellCommand(props.cmd)
          }
          proc = Bun.spawn(['bash', '-c', props.cmd], {
            cwd: effectiveCwd,
            env: { ...process.env, ...props.env },
            stdout: 'pipe',
            stderr: 'pipe',
          })
        }

        // Setup timeout with cleanup tracking
        const timeoutPromise = new Promise<'timeout'>((resolve) => {
          timeoutIdRef.current = setTimeout(() => resolve('timeout'), timeout)
        })

        const exitPromise = proc.exited

        const raceResult = await Promise.race([exitPromise, timeoutPromise])

        // Clear timeout on command completion to prevent leak
        if (timeoutIdRef.current !== null) {
          clearTimeout(timeoutIdRef.current)
          timeoutIdRef.current = null
        }

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
        const stdout = proc.stdout ? await new Response(proc.stdout as ReadableStream).text() : ''
        const stderr = proc.stderr ? await new Response(proc.stderr as ReadableStream).text() : ''
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

  const attrs: Record<string, unknown> = { status }
  if (result?.exitCode !== undefined) attrs['exit-code'] = result.exitCode
  if (result?.durationMs !== undefined) attrs['duration-ms'] = result.durationMs

  return (
    <command {...attrs}>
      {childContent}
    </command>
  )
}

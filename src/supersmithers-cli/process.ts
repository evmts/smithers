import type { Subprocess } from 'bun'

export interface SubprocessHandle {
  proc: Subprocess
  kill: (signal?: 'SIGTERM' | 'SIGKILL') => void
  waitForExit: () => Promise<number>
}

export function spawnSmithers(planFile: string): SubprocessHandle {
  const proc = Bun.spawn(['bun', 'run', 'smithers', 'run', planFile], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  })

  return {
    proc,
    kill: (signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM') => {
      try {
        proc.kill(signal === 'SIGTERM' ? 15 : 9)
      } catch {}
    },
    waitForExit: () => proc.exited,
  }
}

export async function gracefulShutdown(handle: SubprocessHandle): Promise<void> {
  const { proc } = handle

  if (proc.exitCode !== null) {
    return
  }

  handle.kill('SIGTERM')

  const timeout = 5000
  const exitPromise = handle.waitForExit()
  const timeoutPromise = new Promise<'timeout'>((resolve) =>
    setTimeout(() => resolve('timeout'), timeout)
  )

  const result = await Promise.race([exitPromise, timeoutPromise])

  if (result === 'timeout' && proc.exitCode === null) {
    handle.kill('SIGKILL')
    await handle.waitForExit()
  }
}

// C-1: VibeLang catch skips native signal errors; ESRCH must become a dead-owner answer.
export const signalable = (send: (pid: number, signal: 0) => void, pid: number): boolean => {
  try {
    send(pid, 0)
    return true
  } catch (cause) {
    // ESRCH means the process is gone. EPERM means it exists and belongs to
    // another user, which is still a live owner this host must not rob. A throw
    // that is not an object at all carries no code, and reading through it
    // rather than off it is what stops that crashing the probe: a thrown string
    // or `null` is an answer nobody gave, which is a live owner.
    return (cause as { readonly code?: string } | null | undefined)?.code !== "ESRCH"
  }
}


export const defaultSignal = (pid: number, signal: 0): void => { process.kill(pid, signal) }

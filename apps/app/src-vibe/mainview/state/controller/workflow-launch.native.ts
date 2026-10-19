// E-7 (EK4402): a poll's pause is a platform timer (unref'd so Bun and Node can exit),
// which VibeLang code does not start. workflow-launch.vibe calls it where workflow-launch.ts pauses.

/** Resolves after `ms` (at least 1), or at once when `signal` aborts; leaves no timer or listener behind. */
export const pauseFor = (ms: number, signal: AbortSignal, unref: (timer: ReturnType<typeof setTimeout>) => void): Promise<void> => new Promise<void>(resolve => {
  if (signal.aborted) { resolve(); return }
  const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve() }
  const timer = setTimeout(done, Math.max(1, ms))
  unref(timer)
  signal.addEventListener("abort", done, { once: true })
})

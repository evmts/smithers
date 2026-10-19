// E-7 (EK4402): process.exitCode is a platform API that VibeLang code does not
// write directly. CommandStatus.vibe's default sink writes it here, exactly as
// CommandStatus.ts does.

/** Sets the process exit code the default command-status sink records. */
export const writeExitCode = (code: number): void => {
  process.exitCode = code
}

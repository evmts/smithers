/** effectscript-4a verification copy only: the process environment, read outside VibeLang (EK4402). @vibelang trusted */
export const processEnv = (): Record<string, string | undefined> | undefined => globalThis.process?.env

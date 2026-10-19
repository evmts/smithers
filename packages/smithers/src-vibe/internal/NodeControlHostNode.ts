// E-7 (EK4402): process.env is a platform read that VibeLang code does not make
// directly. NodeControlHost.vibe's production transport reads the egress proxy
// from it here, exactly as NodeControlHost.ts does.

/** This process's environment record. */
export const processEnvironment = (): NodeJS.ProcessEnv => process.env

// E-7/EK4402: process.env is a platform read. CloudSandbox.vibe's plain
// `make` reads it here, where CloudSandbox.ts reads it.

/** `process.env`, the default workspace environment. */
export const processEnvironment = (): Readonly<Record<string, string | undefined>> => process.env

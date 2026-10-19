// E-7/EK4402: node:path and process.env are platform APIs, which VibeLang code
// does not call directly (as in S7's flows/database hatches). `BunHost.vibe`
// reads them through these: `absoluteRoot` checks `isAbsolute`, and
// `layerHttpClient` hands the live `process.env` object to the egress client.
import { isAbsolute } from "node:path"

export const isAbsolutePath = (path: string): boolean => isAbsolute(path)

export const hostEnvironment = (): Readonly<Record<string, string | undefined>> => process.env

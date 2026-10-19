// E-7 (EK4402): os.hostname and process.pid are platform APIs that VibeLang
// code does not call directly. RunListing.vibe builds its status observer's
// owner identity from these, exactly as RunListing.ts does at module load.
import { hostname } from "node:os"

/** This host's name. */
export const hostName = (): string => hostname()

/** This process's id. */
export const processId = (): number => process.pid

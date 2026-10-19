// E-7: platform reads in release-support/runtime's plain host factories (EK4402): the process
// environment (agentLayers' and runtime's defaults) and this machine's name (runtime's owner).
import { hostname as nodeHostname } from "node:os"

export const processEnv = (): NodeJS.ProcessEnv => process.env
export const hostname = (): string => nodeHostname()

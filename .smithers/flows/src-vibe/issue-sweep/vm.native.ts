// E-7: the Node platform calls vm.vibe's plain helpers make (EK4402). One call each.
import { readdirSync as nodeReaddirSync } from "node:fs"
import { hostname as nodeHostname } from "node:os"

export const env = (name: string): string | undefined => process.env[name]
export const setEnv = (name: string, value: string): void => {
  process.env[name] = value
}
export const setEnvDefault = (name: string, value: string): void => {
  process.env[name] ??= value
}
export const platform = (): string => process.platform
export const arch = (): string => process.arch
export const pid = (): number => process.pid
export const kill = (pid: number, signal: number): void => {
  process.kill(pid, signal)
}
export const readdirSync = (path: string): Array<string> => nodeReaddirSync(path)
export const hostname = (): string => nodeHostname()

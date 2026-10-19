// E-7 (EK4402): the Node path and home-directory reads issue-sweep/work/flow.vibe's
// plain helpers make, verbatim from issue-sweep/work/flow.ts.
import { homedir } from "node:os"
import { posix } from "node:path"

export const loginFile = (account: string) => `${homedir()}/.smithers/accounts/${account}/auth.json`
export const posixJoin = (...paths: Array<string>): string => posix.join(...paths)
export const posixDirname = (path: string): string => posix.dirname(path)

// E-7 (EK4402): the node:path calls RspackRunner.vibe's plain code makes, exactly as
// RspackRunner.ts makes them.
import * as NodePath from "node:path"

/** `NodePath.isAbsolute`. */
export const isAbsolute = (path: string): boolean => NodePath.isAbsolute(path)

/** `NodePath.join`. */
export const join = (...paths: Array<string>): string => NodePath.join(...paths)

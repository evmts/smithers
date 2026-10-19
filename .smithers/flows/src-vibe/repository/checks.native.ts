// E-7: node:path's glob matcher, which checks.vibe and jev-checks.vibe call from plain code.
// VibeLang code does not call platform APIs directly (EK4402); the wrapper is one call.
import { matchesGlob as nodeMatchesGlob } from "node:path"

export const matchesGlob = (path: string, pattern: string): boolean => nodeMatchesGlob(path, pattern)

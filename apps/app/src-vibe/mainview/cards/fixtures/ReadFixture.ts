/// <reference types="node" />
// E-7: preserve the synchronous native fixture read in a minimal TypeScript hatch.
import { readFileSync } from "node:fs"
export const readFixtureText = (url: URL): string => readFileSync(url, "utf8")

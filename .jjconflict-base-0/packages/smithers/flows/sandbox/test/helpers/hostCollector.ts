/**
 * The garbage collector of the runtime a real-backend suite runs on: Bun's
 * under the Bun lane, Node's otherwise, each from its host package.
 */
import { BunGarbageCollector } from "@smthrs/platform-bun"
import { NodeGarbageCollector } from "@smthrs/platform-node"
import type * as MicrosandboxSandbox from "../../src/MicrosandboxSandbox/index.ts"

export const hostCollector: MicrosandboxSandbox.GarbageCollector = process.versions.bun === undefined
  ? NodeGarbageCollector.collector
  : BunGarbageCollector.collector

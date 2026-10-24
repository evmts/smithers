import branchManifest from "../../plugins/branches/plugin.json" with { type: "json" }
import branchSource from "../../plugins/branches/src/create.source.json" with { type: "json" }

/** Server-safe flow registry: authored modules are packaged as source, without importing browser UI. */
export const CREATION = { manifest: branchManifest, source: branchSource, tag: "branches/create" } as const

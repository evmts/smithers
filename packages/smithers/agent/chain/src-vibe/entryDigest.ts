// D-2: synchronous sibling TypeScript canonicalization and digest.
import * as Digest from "@smthrs/core/Digest"
import type { Entry } from "./Catalog.vibe"
export const entryDigestImpl = (entry: Entry): string =>
  // An empty override falls back too: every call key pins a non-empty
  // digest, whatever the host supplied. Declared capabilities are part
  // of the declaration: narrowing or widening a claim re-keys the calls
  // settled under it.
  entry.digest !== undefined && entry.digest !== ""
    ? entry.digest
    : Digest.digest(Digest.canonical({
      capabilities: entry.capabilities ?? null,
      description: entry.description,
      name: entry.name
    }))


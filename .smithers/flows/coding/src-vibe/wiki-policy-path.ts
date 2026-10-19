// E-7/EK4402: fileURLToPath (node:url) is a platform API that VibeLang code
// does not call directly. The policy sources are located from this module, as
// wiki-policy.ts locates them from itself.
import { fileURLToPath } from "node:url"

export const policySourcePath = (source: string): string =>
  fileURLToPath(new URL(`../../../${source}`, import.meta.url))

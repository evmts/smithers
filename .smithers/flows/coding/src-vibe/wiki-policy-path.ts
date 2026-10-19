// E-7/EK4402: fileURLToPath (node:url) is a platform API that VibeLang code
// does not call directly. wiki-policy.vibe resolves each policy source's URL
// from its own import.meta.url (C-9 fixed E-12's TS1470) and converts it here.
import { fileURLToPath } from "node:url"

export const policySourcePath = (url: URL): string => fileURLToPath(url)

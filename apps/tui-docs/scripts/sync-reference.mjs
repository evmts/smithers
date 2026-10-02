/** M-35 and mvp.md §8 remove the public TUI reference; registries stay intact. */
import { rmSync } from "node:fs"

for (const page of ["commands", "keys"]) {
  rmSync(new URL(`../../site/src/content/docs/docs/tui/${page}.mdx`, import.meta.url), { force: true })
}

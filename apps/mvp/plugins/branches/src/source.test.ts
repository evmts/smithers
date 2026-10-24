import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

test("the Worker source asset contains the authored flow module byte for byte", async () => {
  const source = readFileSync(new URL("./create.ts", import.meta.url), "utf8")
  await expect(`${JSON.stringify(source)}\n`).toMatchFileSnapshot("./create.source.json")
})

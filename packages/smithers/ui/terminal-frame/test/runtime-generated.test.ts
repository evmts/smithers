// The frame runtime is generated from its sources and committed, so a page
// loads it without a build step. A change to the frame has to be generated
// again (`node scripts/build-runtime.mjs`), and this fails until it is.
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
// @ts-expect-error -- a build script, with no declarations
import { generated } from "../scripts/build-runtime.mjs";

test("the generated frame runtime matches its sources", async () => {
  const files = (await generated()) as Record<string, string>;
  expect(Object.keys(files)).toEqual(["src/runtime.generated.ts"]);
  const committed = await readFile(join(import.meta.dir, "..", "src/runtime.generated.ts"), "utf8");
  expect(committed === files["src/runtime.generated.ts"] ? "current" : "stale: run `node scripts/build-runtime.mjs`")
    .toBe("current");
}, 60_000);

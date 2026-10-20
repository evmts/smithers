// The presentation bundle and the frame runtimes (a generated view's, and the
// terminal frame's with xterm.js) are generated from their sources and
// committed, so a page loads them without a build step. A change to a subset
// component, the sanitizer, the bridge client or the terminal frame has to be
// generated again, and this fails until it is.
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
// @ts-expect-error -- a build script, with no declarations
import { generated } from "../scripts/build-views.mjs";

const root = join(import.meta.dir, "..");

test("the generated presentation bundle and frame runtimes match their sources", async () => {
  const files = (await generated()) as Record<string, string>;
  expect(Object.keys(files)).toContain("src/adapters/terminal-frame/runtime.generated.ts");
  for (const [path, contents] of Object.entries(files)) {
    const committed = await readFile(join(root, path), "utf8");
    expect(committed === contents ? "current" : `${path} is stale: run \`node scripts/build-views.mjs\` in packages/smithers/ui`)
      .toBe("current");
  }
}, 60_000);

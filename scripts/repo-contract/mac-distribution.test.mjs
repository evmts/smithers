import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseIgnore, walkFiles } from "../check-tracked-hygiene.mjs"
const root = fileURLToPath(new URL("../../", import.meta.url))

// Use the repository's existing ignore-aware walk: the lifecycle CI runner
// provides Node, but does not promise an external search executable (#3460).
function references(directory, paths, patterns) {
  // A missing search root is a broken gate, never a clean scan.
  for (const path of paths) lstatSync(join(directory, path))
  const rules = parseIgnore(readFileSync(join(directory, ".gitignore"), "utf8"))
  const matches = []
  for (const path of walkFiles(directory, rules)) {
    if (!paths.some(scope => path === scope || path.startsWith(`${scope}/`)) || path.endsWith(".lock")) continue
    // Do not follow dependency or fixture symlinks outside the checkout.
    if (!lstatSync(join(directory, path)).isFile()) continue
    const content = readFileSync(join(directory, path), "utf8")
    if (content.includes("\0")) continue
    for (const [index, line] of content.split("\n").entries()) {
      if (patterns.some(pattern => line.includes(pattern))) matches.push(`${path}:${index + 1}:${line}`)
    }
  }
  return matches
}

const removed = ["distribution/" + "Dockerfile", ...["entrypoint.sh", "publish-image.sh", "publish-image.test.mjs", "test-image.sh"].map(name => `distribution/${name}`),
  "apps/app/scripts/mode-matrix/" + "docker-web-" + "selfhost.ts", "apps/app/scripts/mode-matrix/" + "docker-web-" + "selfhost.test.ts"]
test("removed image files are absent", () => {
  for (const file of removed) assert.equal(existsSync(`${root}/${file}`), false, file)
})
test("active consumers contain no deleted image or launcher references", () => {
  const patterns = ["distribution/" + "Dockerfile", "ghcr.io/smithersai/" + "smithers", "docker-web-" + "selfhost", "SMITHERS_MODE_MATRIX_" + "IMAGE"]
  const found = references(root, [".github", "scripts", "apps", "packages", "distribution", "PACKAGE.ts", ".smithers/target-index.json"], patterns)
  assert.deepEqual(found, [], found.join("\n"))
})
test("retired lifecycle scripts are absent and no active consumer runs them", () => {
  // T-INS-07 ported their guards to the backend; `smthrs host` owns the lifecycle.
  for (const name of ["backup.sh", "restore.sh", "upgrade.sh", "lib.sh", "distribution_test.go"]) assert.equal(existsSync(`${root}/distribution/${name}`), false, name)
  const patterns = ["distribution/" + "lib.sh", "distribution/" + "backup.sh", "distribution/" + "restore.sh", "distribution/" + "upgrade.sh", "SMITHERS_" + "BACKUP_ROOT", "SMITHERS_LIB" + "="]
  const found = references(root, [".github", "scripts", "apps", "packages", "distribution"], patterns)
  assert.deepEqual(found, [], found.join("\n"))
})
test("the surviving build test and command executor remain", () => {
  assert.ok(existsSync(`${root}/packages/backend/internal/compose/build_backend_script_test.go`))
  assert.ok(existsSync(`${root}/apps/app/scripts/mode-matrix/command-execution.ts`))
})
test("distribution files live beside their callers and model fakes stay gone", () => {
  // The Mac bundle's manifest writer and licenses sit with the bundle build;
  // the CLI release installer with the release scripts (#4086).
  for (const file of ["apps/app/scripts/flow-host-manifest.mts", "apps/app/licenses/jj-LICENSE",
    "apps/app/licenses/git-COPYING", "scripts/release/build-cli.mjs", "scripts/release/install-cli.mjs"]) {
    assert.ok(existsSync(`${root}/${file}`), file)
  }
  // Only the hand-written model fakes remain, until recorded models replace
  // them (#4086); nothing new joins them.
  assert.deepEqual(readdirSync(`${root}/distribution`).sort(), ["fake-coding-provider.mjs", "fake-coding-provider.test.mjs",
    "fake-todo-provider.mjs", "fake-todo-turns.d.mts", "fake-todo-turns.mjs", "fake-todo-turns.test.mjs"])
  const patterns = ["distribution/" + "flow-host-manifest", "distribution/" + "licenses",
    "distribution/" + "install-cli", "distribution/" + "build-cli", "distribution/" + "backend_build_test"]
  const found = references(root, [".github", "scripts", "apps", "packages", "flows", "PACKAGE.ts"], patterns)
  assert.deepEqual(found, [], found.join("\n"))
})

test("distribution checks run without an external search executable", () => {
  // A fresh test runner must not inherit the parent's child-runner context.
  const env = { ...process.env, PATH: "" }
  delete env.NODE_TEST_CONTEXT
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "--test-name-pattern=^(removed image files|active consumers|retired lifecycle scripts|the surviving build test|distribution files live)", fileURLToPath(import.meta.url)], {
    cwd: root, env, encoding: "utf8", timeout: 30_000
  })
  assert.equal(result.error, undefined, result.error?.message)
  assert.match(result.stdout, /^# tests 5$/m, "the child must execute all five distribution checks")
  assert.equal(result.status, 0, `${result.stdout ?? ""}${result.stderr ?? ""}`)
})

test("reference checks retain findings and ignore generated files without following symlinks", t => {
  const directory = mkdtempSync(join(tmpdir(), "distribution-contract-"))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  mkdirSync(join(directory, "apps/nested"), { recursive: true })
  mkdirSync(join(directory, "apps/node_modules"))
  mkdirSync(join(directory, ".github/workflows"), { recursive: true })
  writeFileSync(join(directory, ".gitignore"), "node_modules/\n")
  writeFileSync(join(directory, "apps/nested/consumer.js"), "first line\nretired/image\n")
  writeFileSync(join(directory, ".github/workflows/.hidden.yml"), "retired/launch\n")
  writeFileSync(join(directory, "apps/node_modules/ignored.js"), "retired/image")
  writeFileSync(join(directory, "apps/ignored.lock"), "retired/image")
  writeFileSync(join(directory, "apps/binary"), "\0retired/image")
  writeFileSync(join(directory, "outside.js"), "retired/image")
  symlinkSync(join(directory, "outside.js"), join(directory, "apps/link.js"))
  const paths = ["apps", ".github"]
  assert.deepEqual(references(directory, paths, ["retired/image", "retired/launch"]), [
    ".github/workflows/.hidden.yml:1:retired/launch",
    "apps/nested/consumer.js:2:retired/image"
  ])
  assert.deepEqual(references(directory, paths, ["absent/reference"]), [])
  assert.throws(() => references(directory, ["missing"], ["retired/image"]), { code: "ENOENT" })
})

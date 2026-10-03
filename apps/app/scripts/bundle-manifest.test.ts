import { createHash } from "node:crypto"
import { test, expect } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, symlinkSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { createBundleManifest, verifyBundleManifest, validateBuildSHA, validateNodeVersion, validatePostgresVersion, validateMsbVersion } from "./bundle-manifest"

test("pins reject missing, short and unsupported versions", () => {
  for (const value of [undefined, "abc"]) expect(() => validateBuildSHA(value)).toThrow()
  expect(validateBuildSHA("a".repeat(40))).toBe("a".repeat(40))
  for (const value of ["v25.4.0", "v26.3.0", "v27.0.0"]) expect(() => validateNodeVersion(value)).toThrow()
  validateNodeVersion("v26.4.0")
  expect(() => validatePostgresVersion("postgres (PostgreSQL) 17.5")).toThrow()
  validatePostgresVersion("postgres (PostgreSQL) 18.1")
  validatePostgresVersion("postgres (PostgreSQL) 18.6 (Homebrew)")
  expect(() => validateMsbVersion("msb 0.6.15")).toThrow()
  validateMsbVersion("msb 0.6.16")
})

test("manifest detects changed bytes, missing entries and escaping links", () => {
  const root = mkdtempSync(join(tmpdir(), "bundle-manifest-"))
  try {
    writeFileSync(join(root, "payload"), "original")
    const save = () => writeFileSync(join(root, "manifest.json"), JSON.stringify(createBundleManifest(root, "a".repeat(40), { payload: "fixture" })))
    save()
    verifyBundleManifest(root)
    writeFileSync(join(root, "payload"), "changed")
    expect(() => verifyBundleManifest(root)).toThrow("hash mismatch")
    save()
    writeFileSync(join(root, "unlisted"), "extra")
    expect(() => verifyBundleManifest(root)).toThrow("inventory")
    rmSync(join(root, "unlisted"))
    symlinkSync("/etc/hosts", join(root, "payload-link"))
    expect(() => createBundleManifest(root, "a".repeat(40), { payload: "fixture", "payload-link": "fixture" })).toThrow("escapes")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

import { verifyRelocatedLayout } from "./server-bundle.integration.test"

test("layout requires payloads and refuses developer home references", () => {
  const root = mkdtempSync(join(tmpdir(), "bundle-layout-"))
  const files = ["bin/smithers-backend", "bin/node", "bin/git", "bin/jj", "bin/smithers-coding-host", "bin/smithers-model-host", "bin/flow-hosts.json", "bin/linux-arm64/smithers-jj-export", "bin/libsmithers_ffi.dylib", "views/mainview/index.html", "postgres/bundle.json", "bin/smithers-server", "bin/msb", "lib/libkrunfw.5.dylib", "share/microsandbox/smithers-guest.py", "share/microsandbox/base-image.oci.tar", "share/microsandbox/base-image.json"]
  const stages = Object.fromEntries(files.map((file) => [file, "fixture"]))
  const save = () => writeFileSync(join(root, "manifest.json"), JSON.stringify(createBundleManifest(root, "a".repeat(40), stages)))
  try {
    for (const file of files) { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), "fixture") }
    const elf = Buffer.alloc(20); elf.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]); elf.writeUInt16LE(183, 18)
    writeFileSync(join(root, "bin/linux-arm64/smithers-jj-export"), elf)
    writeFileSync(join(root, "share/microsandbox/base-image.json"), JSON.stringify({ image: "node@sha256:" + "a".repeat(64), archive: "base-image.oci.tar", sha256: createHash("sha256").update("fixture").digest("hex") }))
    save()
    verifyRelocatedLayout(root)
    rmSync(join(root, "bin/msb"))
    save()
    expect(() => verifyRelocatedLayout(root)).toThrow("Missing bundle payload")
    writeFileSync(join(root, "bin/msb"), join(homedir(), "private"))
    save()
    expect(() => verifyRelocatedLayout(root)).toThrow("Developer home reference")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

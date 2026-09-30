import { describe, expect, test } from "bun:test"
import { chmod, realpath, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { authenticatedBrowserOptions } from "./browser-options"

describe("authenticated browser selection", () => {
  test("omission uses bundled Chromium while every launch shares headed and renderer options", async () => {
    const options = await authenticatedBrowserOptions("https://product.invalid", { SMITHERS_REAL_HEADED: "1" })
    expect(options.launch).toEqual({ headless: false })
    expect(options.context).toEqual({ baseURL: "https://product.invalid", viewport: { width: 1280, height: 900 } })
    expect(options.persistent).toEqual({ ...options.launch, ...options.context })
    expect((await authenticatedBrowserOptions("https://product.invalid", {})).launch).toEqual({ headless: true })
  })

  test("requires a real executable file and canonicalizes a valid symlink", async () => {
    const folder = await mkdtemp(join(tmpdir(), "smithers-browser-options-"))
    try {
      const executable = join(folder, "browser")
      await writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 })
      const linked = join(folder, "browser-link")
      await symlink(executable, linked)
      const options = await authenticatedBrowserOptions("https://product.invalid", { SMITHERS_E2E_BROWSER_EXECUTABLE: linked })
      expect(options.launch.executablePath).toBe(await realpath(executable))
      expect(options.persistent.executablePath).toBe(options.launch.executablePath)
      const mac = await authenticatedBrowserOptions("https://product.invalid", { SMITHERS_E2E_BROWSER_EXECUTABLE: linked }, "darwin")
      expect(mac.launch.ignoreDefaultArgs).toEqual(["--use-mock-keychain", "--password-store=basic"])
      expect(mac.persistent.ignoreDefaultArgs).toEqual(mac.launch.ignoreDefaultArgs)
      const linux = await authenticatedBrowserOptions("https://product.invalid", { SMITHERS_E2E_BROWSER_EXECUTABLE: linked }, "linux")
      expect(linux.launch).not.toHaveProperty("ignoreDefaultArgs")
      const bundled = await authenticatedBrowserOptions("https://product.invalid", {}, "darwin")
      expect(bundled.launch).not.toHaveProperty("ignoreDefaultArgs")
      await chmod(executable, 0o600)
      await expect(authenticatedBrowserOptions("https://product.invalid", { SMITHERS_E2E_BROWSER_EXECUTABLE: executable })).rejects.toThrow()
      const directory = join(folder, "directory")
      await mkdir(directory)
      await expect(authenticatedBrowserOptions("https://product.invalid", { SMITHERS_E2E_BROWSER_EXECUTABLE: directory })).rejects.toThrow("regular file")
      for (const selected of ["", " ", "relative/browser", join(folder, "missing"), linked]) {
        if (selected === linked) await rm(executable)
        await expect(authenticatedBrowserOptions("https://product.invalid", { SMITHERS_E2E_BROWSER_EXECUTABLE: selected })).rejects.toThrow()
      }
    } finally { await rm(folder, { recursive: true, force: true }) }
  })
})

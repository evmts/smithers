import { constants } from "node:fs"
import { access, realpath, stat } from "node:fs/promises"
import { isAbsolute } from "node:path"

/** Explicit executable selection also applies to manually launched profiles. */
export const authenticatedBrowserOptions = async (baseURL: string, environment: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform) => {
  const configured = environment.SMITHERS_E2E_BROWSER_EXECUTABLE
  let executablePath: string | undefined
  if (configured !== undefined) {
    if (!configured.trim() || !isAbsolute(configured)) throw new Error("SMITHERS_E2E_BROWSER_EXECUTABLE must be an absolute executable file path.")
    executablePath = await realpath(configured)
    if (!(await stat(executablePath)).isFile()) throw new Error("SMITHERS_E2E_BROWSER_EXECUTABLE must identify a regular file.")
    await access(executablePath, constants.X_OK)
  }
  const launch = { headless: environment.SMITHERS_REAL_HEADED !== "1", ...(executablePath ? { executablePath, ...(platform === "darwin" ? { ignoreDefaultArgs: ["--use-mock-keychain", "--password-store=basic"] } : {}) } : {}) }
  const context = { baseURL, viewport: { width: 1280, height: 900 } }
  return { launch, context, persistent: { ...launch, ...context } }
}

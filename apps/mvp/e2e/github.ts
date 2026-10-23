import { expect, type Page } from "@playwright/test"

/** GitHub's own answer, authenticated when E2E_GITHUB_TOKEN is set. Absolute URLs support local HTTP tests. */
export const github = async <A>(page: Pick<Page, "request">, path: string): Promise<A> => {
  const token = process.env.E2E_GITHUB_TOKEN ?? ""
  const response = await page.request.get(new URL(path, "https://api.github.com").href, {
    headers: { accept: "application/vnd.github+json", ...(token === "" ? {} : { authorization: `Bearer ${token}` }) },
  })
  const status = response.status()
  if (status === 403 || status === 429) {
    throw new Error(`GitHub's ${path}: HTTP ${status}; access refused or rate limited. Check E2E_GITHUB_TOKEN and GitHub's rate limit.`)
  }
  if (status !== 200) throw new Error(`GitHub's ${path}: HTTP ${status}`)
  return (await response.json()) as A
}

/** Poll successful reads for propagation; request failures escape immediately instead of being swallowed by expect.poll. */
export const pollGitHub = async <A>(read: () => Promise<A>, found: (value: A) => boolean): Promise<A> => {
  let result: { value: A } | { error: unknown } | undefined
  await expect.poll(async () => {
    try {
      const value = await read()
      if (found(value)) result = { value }
    } catch (error) {
      result = { error }
    }
    return result !== undefined
  }, { timeout: 120_000, intervals: [2_000, 5_000] }).toBe(true)
  if ("error" in result!) throw result.error
  return result!.value
}

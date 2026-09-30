/** The scoped account selected by this qualification, never a factory administrator. */
export const githubSourceOwner = (environment: NodeJS.ProcessEnv = process.env): string => {
  const login = environment.SMITHERS_E2E_EXPECTED_LOGIN ?? "codeplanesmithers"
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login)) throw new Error("SMITHERS_E2E_EXPECTED_LOGIN must be a GitHub login.")
  return login
}

export const assertOwnedGitHubSource = (fullName: string, environment: NodeJS.ProcessEnv = process.env): void => {
  const owner = githubSourceOwner(environment)
  if (!fullName.startsWith(`${owner}/smithers-e2e-import-`) || !/^[a-z\d-]+\/smithers-e2e-import-[a-z\d-]+$/i.test(fullName)) {
    throw new Error(`Refusing a GitHub source outside the selected account's owned E2E namespace: ${fullName}`)
  }
}

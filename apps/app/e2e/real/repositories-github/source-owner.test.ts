import { expect, test } from "bun:test"
import { assertOwnedGitHubSource, githubSourceOwner } from "./source-owner"

test("owned sources bind both the explicitly selected account and disposable name", () => {
  const environment = { SMITHERS_E2E_EXPECTED_LOGIN: "test-account" }
  expect(githubSourceOwner(environment)).toBe("test-account")
  expect(() => assertOwnedGitHubSource("test-account/smithers-e2e-import-unique", environment)).not.toThrow()
  for (const fullName of ["codeplanesmithers/smithers-e2e-import-unique", "test-account/product", "test-account/smithers-e2e-import-", "test-account/smithers-e2e-import-one/extra"]) {
    expect(() => assertOwnedGitHubSource(fullName, environment)).toThrow("owned E2E namespace")
  }
  for (const login of ["", " ", "test/account", "-test", "test-", "x".repeat(40)]) {
    expect(() => githubSourceOwner({ SMITHERS_E2E_EXPECTED_LOGIN: login })).toThrow("GitHub login")
  }
})

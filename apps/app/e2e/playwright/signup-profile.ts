import type { Page } from "@playwright/test"
import { SIGNUP_PROFILE_PATH, SignupProfileSchema, type SignupProfile } from "../../src/mainview/state/Signup"

/** Controlled HTTP fixture for the selected test account's canonical saved profile. */
export async function signupProfile(page: Page) {
  let profile: SignupProfile | null = null
  const writes: SignupProfile[] = []
  const reads: Array<SignupProfile | null> = []
  await page.route(`**${SIGNUP_PROFILE_PATH}`, async route => {
    const request = route.request()
    if (request.method() === "GET") {
      reads.push(structuredClone(profile))
      return route.fulfill({ json: { profile } })
    }
    if (request.method() !== "PUT") return route.fulfill({ status: 405, json: { message: "Unexpected signup method" } })
    const parsed = SignupProfileSchema.strict().safeParse(request.postDataJSON())
    if (!parsed.success) return route.fulfill({ status: 400, json: { message: "Invalid signup profile" } })
    profile = structuredClone(parsed.data)
    writes.push(structuredClone(profile))
    return route.fulfill({ json: { profile } })
  })
  return { writes, reads }
}

import { describe, expect, test } from "bun:test"
import { appCoverageRow, missingRepositoryOffer, readAppCoverage } from "./RepositoryEntryOffer"
import { INSTALL_VERIFY_PATH } from "./state/seams/GitHubSeam"

/*
 * `/owner/repo` for a repository Smithers does not have, signed in (M-46):
 * the route offers Import when the App covers it, the App's installation page
 * when it does not, and says so when the one door that knows could not be
 * read. Nothing here claims the repository is absent from GitHub or private.
 */

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const INSTALL_URL = "https://github.com/apps/smithers/installations/new"

describe("readAppCoverage", () => {
  test("reads the caller's verified installations and the install page, in either spelling", async () => {
    const asked: Array<string> = []
    const http = async (input: RequestInfo | URL) => {
      asked.push(String(input))
      return jsonResponse({ install_url: INSTALL_URL, repos: [
        { full_name: "other/repo", installation_id: 7 },
        { fullName: "Acme/Widgets", installationId: 42, pushedAt: "2026-10-01T00:00:00Z" }
      ] })
    }
    expect(await readAppCoverage(http, "acme/widgets")).toEqual({ covered: true, installationId: 42, installUrl: INSTALL_URL })
    expect(asked).toEqual([INSTALL_VERIFY_PATH])
  })

  test("a repository the list does not name is not covered, and keeps the install page", async () => {
    const http = async () => jsonResponse({ install_url: INSTALL_URL, repos: [{ fullName: "acme/widgets", installationId: 42 }] })
    expect(await readAppCoverage(http, "acme/missing")).toEqual({ covered: false, installationId: null, installUrl: INSTALL_URL })
  })

  test("an empty installation list is not covered", async () => {
    const http = async () => jsonResponse({ repos: [] })
    expect(await readAppCoverage(http, "acme/widgets")).toEqual({ covered: false, installationId: null, installUrl: null })
  })

  test("a refusal, an unreadable body and a dropped request all answer nothing learnt", async () => {
    for (const status of [401, 403, 404, 500]) {
      expect(await readAppCoverage(async () => jsonResponse({ code: "forbidden" }, status), "acme/widgets")).toBeNull()
    }
    expect(await readAppCoverage(async () => new Response("<html>", { status: 200 }), "acme/widgets")).toBeNull()
    expect(await readAppCoverage(async () => jsonResponse({ repos: "unavailable" }), "acme/widgets")).toBeNull()
    expect(await readAppCoverage(async () => { throw new TypeError("ECONNRESET secret-socket-detail") }, "acme/widgets")).toBeNull()
  })

  test("a malformed row never becomes a repository identity", async () => {
    const http = async () => jsonResponse({ repos: [null, { fullName: "../secret" }, { fullName: 7 }, { fullName: "acme/widgets/extra" }] })
    expect(await readAppCoverage(http, "acme/widgets")).toEqual({ covered: false, installationId: null, installUrl: null })
  })
})

describe("the App-status row a coverage answer writes", () => {
  test("states the coverage the installations door verified, and where to install", () => {
    expect(appCoverageRow("acme/widgets", { covered: true, installationId: 42, installUrl: INSTALL_URL })).toEqual({
      repo: "acme/widgets", installed: true, configured: true, installationId: 42, installUrl: INSTALL_URL, rateLimit: null
    })
    expect(appCoverageRow("acme/widgets", { covered: false, installationId: null, installUrl: null })).toEqual({
      repo: "acme/widgets", installed: false, configured: false, installationId: null, installUrl: null, rateLimit: null
    })
  })
})

describe("missingRepositoryOffer", () => {
  test("a covered repository is offered the existing import flow, by name", () => {
    const offer = missingRepositoryOffer("acme/widgets", { installed: true, configured: true, installUrl: null })
    expect(offer.kind).toBe("import")
    expect(offer.text).toBe("Smithers doesn't have acme/widgets yet. The Smithers GitHub App covers it for your account, so you can import it.")
    expect(offer.action).toEqual({ flow: "repos.import", args: "acme/widgets", label: "Import acme/widgets" })
  })

  test("an uncovered repository gets the App's installation page and no import", () => {
    const offer = missingRepositoryOffer("acme/widgets", { installed: false, configured: false, installUrl: INSTALL_URL })
    expect(offer.kind).toBe("install")
    expect(offer.action).toBeUndefined()
    expect(offer.text).toContain(`[Install the Smithers GitHub App](${INSTALL_URL})`)
    // Absent on GitHub and withheld by GitHub are the same 404 upstream: neither is claimed.
    expect(offer.text).toContain("GitHub may not have it, may not show it to you, or the App may not be installed on it")
    expect(offer.text).not.toContain("private")
    expect(offer.text).not.toContain("does not exist")
  })

  test("an install page that is not github.com is never linked", () => {
    for (const url of ["http://github.com/apps/smithers", "https://github.com.evil.example/apps", "javascript:alert(1)", "not a url"]) {
      const offer = missingRepositoryOffer("acme/widgets", { installed: false, configured: false, installUrl: url })
      expect(offer.text).not.toContain(url)
      expect(offer.text).toContain("no GitHub App installation page")
      expect(offer.action).toBeUndefined()
    }
  })

  test("an unread coverage door says that, and invents no act", () => {
    const offer = missingRepositoryOffer("acme/widgets", undefined)
    expect(offer.kind).toBe("unknown")
    expect(offer.text).toBe("Smithers doesn't have acme/widgets, and couldn't read whether the Smithers GitHub App covers it for your account.")
    expect(offer.action).toBeUndefined()
  })

  test("an installed App whose configuration is incomplete is not an import offer", () => {
    expect(missingRepositoryOffer("acme/widgets", { installed: true, configured: false, installUrl: INSTALL_URL }).kind).toBe("install")
  })
})

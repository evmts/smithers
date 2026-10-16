import { describe, expect, test } from "bun:test"
import { appCoverageRow, GITHUB_ACCESS_PATH, missingRepositoryOffer, readAppCoverage, readRepoAccess } from "./RepositoryEntryOffer"
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
    expect(await readAppCoverage(http, "acme/widgets")).toEqual({ covered: true, appInstalled: true, installationId: 42, installUrl: INSTALL_URL })
    expect(asked).toEqual([INSTALL_VERIFY_PATH])
  })

  test("a repository the list does not name is not covered, and keeps the install page", async () => {
    const http = async () => jsonResponse({ install_url: INSTALL_URL, repos: [{ fullName: "acme/widgets", installationId: 42 }] })
    expect(await readAppCoverage(http, "acme/missing")).toEqual({ covered: false, appInstalled: false, installationId: null, installUrl: INSTALL_URL })
  })

  test("an empty installation list is not covered", async () => {
    const http = async () => jsonResponse({ repos: [] })
    expect(await readAppCoverage(http, "acme/widgets")).toEqual({ covered: false, appInstalled: false, installationId: null, installUrl: null })
  })

  test("a refusal, an unreadable body and a dropped request all answer nothing learnt", async () => {
    for (const status of [401, 403, 404, 500]) {
      expect(await readAppCoverage(async () => jsonResponse({ code: "forbidden" }, status), "acme/widgets")).toBeNull()
    }
    expect(await readAppCoverage(async () => new Response("<html>", { status: 200 }), "acme/widgets")).toBeNull()
    expect(await readAppCoverage(async () => jsonResponse({ repos: "unavailable" }), "acme/widgets")).toBeNull()
    expect(await readAppCoverage(async () => { throw new TypeError("ECONNRESET secret-socket-detail") }, "acme/widgets")).toBeNull()
  })

  /*
   * "Not covered" is a verdict about a WHOLE list. A row this client cannot
   * read makes the list partial, and a partial list proves nothing: the
   * answer is unknown, never "the App does not cover it".
   */
  test("a malformed row makes the whole answer unknown, never not-covered", async () => {
    for (const row of [null, { fullName: "../secret" }, { fullName: 7 }, { fullName: "acme/widgets/extra" }]) {
      expect(await readAppCoverage(async () => jsonResponse({ repos: [row] }), "acme/widgets")).toBeNull()
    }
    // One unreadable row beside the match still answers nothing learnt.
    expect(await readAppCoverage(async () => jsonResponse({ repos: [{ fullName: "acme/widgets", installationId: 42 }, null] }), "acme/widgets")).toBeNull()
  })

  test("a row without an installation id is still that repository, with no id invented", async () => {
    const http = async () => jsonResponse({ repos: [{ fullName: "acme/widgets", installationId: "42" }] })
    expect(await readAppCoverage(http, "acme/widgets")).toEqual({ covered: true, appInstalled: true, installationId: null, installUrl: null })
  })
})

describe("readRepoAccess, the one bounded repository diagnosis", () => {
  const diagnosis = (body: Record<string, unknown>, status = 200) => {
    const asked: Array<string> = []
    const http = async (input: RequestInfo | URL) => {
      asked.push(String(input))
      return jsonResponse(body, status)
    }
    return { asked, http }
  }

  test("reads exactly one repository's door, never the account inventory", async () => {
    const { asked, http } = diagnosis({ verdict: "ok", surface: "issues", installation_id: 42, install_url: INSTALL_URL })
    expect(await readRepoAccess(http, "acme/widgets")).toEqual({
      covered: true, appInstalled: true, installationId: 42, installUrl: INSTALL_URL
    })
    expect(asked).toEqual([`${GITHUB_ACCESS_PATH}/acme/widgets?surface=issues`])
    expect(asked.some(url => url.includes(INSTALL_VERIFY_PATH))).toBe(false)
  })

  test("app-not-installed is not covered, and keeps the install page", async () => {
    const { http } = diagnosis({ verdict: "app-not-installed", install_url: INSTALL_URL })
    expect(await readRepoAccess(http, "acme/widgets")).toEqual({
      covered: false, appInstalled: false, installationId: null, installUrl: INSTALL_URL
    })
  })

  test.each(["permission-missing", "no-org-grant"] as const)(
    "%s proves the repository exists and points at the installation page",
    async (verdict) => {
      const approve = "https://github.com/settings/installations/42"
      const { http } = diagnosis({ verdict, installation_id: 42, approve_url: approve, grant_url: INSTALL_URL, install_url: INSTALL_URL })
      expect(await readRepoAccess(http, "acme/widgets")).toEqual({
        covered: false, appInstalled: true, installationId: 42, installUrl: approve
      })
    }
  )

  test("not-configured carries no act: installing can never help here", async () => {
    const { http } = diagnosis({ verdict: "not-configured" })
    expect(await readRepoAccess(http, "acme/widgets")).toEqual({
      covered: false, appInstalled: false, installationId: null, installUrl: null
    })
  })

  test("token-broken says nothing about the repository, so nothing is learnt", async () => {
    const { http } = diagnosis({ verdict: "token-broken" })
    expect(await readRepoAccess(http, "acme/widgets")).toBeNull()
  })

  test("a refusal, an unknown verdict, an unreadable body and a dropped request all learn nothing", async () => {
    for (const status of [401, 403, 429, 500, 503]) {
      expect(await readRepoAccess(async () => jsonResponse({ verdict: "ok" }, status), "acme/widgets")).toBeNull()
    }
    expect(await readRepoAccess(async () => jsonResponse({ verdict: "probably-fine" }), "acme/widgets")).toBeNull()
    expect(await readRepoAccess(async () => jsonResponse({}), "acme/widgets")).toBeNull()
    expect(await readRepoAccess(async () => new Response("<html>", { status: 200 }), "acme/widgets")).toBeNull()
    expect(await readRepoAccess(async () => { throw new TypeError("ECONNRESET secret-socket-detail") }, "acme/widgets")).toBeNull()
    expect(await readRepoAccess(async () => jsonResponse({ verdict: "ok" }), "widgets")).toBeNull()
  })

  /* An origin that serves no single-repository door keeps the older answer. */
  test("an absent door falls back to the account inventory walk", async () => {
    const asked: Array<string> = []
    const http = async (input: RequestInfo | URL) => {
      asked.push(String(input))
      return String(input).startsWith(GITHUB_ACCESS_PATH)
        ? jsonResponse({ code: "not_found" }, 404)
        : jsonResponse({ install_url: INSTALL_URL, repos: [{ fullName: "acme/widgets", installationId: 42 }] })
    }
    expect(await readRepoAccess(http, "acme/widgets")).toEqual({
      covered: true, appInstalled: true, installationId: 42, installUrl: INSTALL_URL
    })
    expect(asked).toEqual([`${GITHUB_ACCESS_PATH}/acme/widgets?surface=issues`, INSTALL_VERIFY_PATH])
  })
})

describe("the App-status row a coverage answer writes", () => {
  test("states the coverage the installations door verified, and where to install", () => {
    expect(appCoverageRow("acme/widgets", { covered: true, appInstalled: true, installationId: 42, installUrl: INSTALL_URL })).toEqual({
      repo: "acme/widgets", installed: true, configured: true, installationId: 42, installUrl: INSTALL_URL, rateLimit: null
    })
    expect(appCoverageRow("acme/widgets", { covered: false, appInstalled: false, installationId: null, installUrl: null })).toEqual({
      repo: "acme/widgets", installed: false, configured: false, installationId: null, installUrl: null, rateLimit: null
    })
    /* An installation that exists but cannot be used for this account: installed, not configured. */
    expect(appCoverageRow("acme/widgets", { covered: false, appInstalled: true, installationId: 7, installUrl: INSTALL_URL })).toEqual({
      repo: "acme/widgets", installed: true, configured: false, installationId: 7, installUrl: INSTALL_URL, rateLimit: null
    })
  })
})

describe("missingRepositoryOffer", () => {
  test("a covered repository is offered the existing import flow, by name", () => {
    const offer = missingRepositoryOffer("acme/widgets", { installed: true, configured: true, installUrl: null })
    expect(offer.kind).toBe("import")
    expect(offer.text).toBe("Smithers doesn't have acme/widgets yet. The Smithers GitHub App covers it for your account.")
    expect(offer.action).toEqual({ flow: "repos.import", args: "acme/widgets", label: "Import" })
  })

  test("an uncovered repository gets the App's installation page and no import", () => {
    const offer = missingRepositoryOffer("acme/widgets", { installed: false, configured: false, installUrl: INSTALL_URL })
    expect(offer.kind).toBe("install")
    expect(offer.action).toBeUndefined()
    expect(offer.text).toBe(
      "Smithers doesn't have acme/widgets, and the Smithers GitHub App doesn't cover it for your account."
      + "\n\nIt may not exist on GitHub, or may not be accessible to this account."
      + `\n\n[Install the Smithers GitHub App](${INSTALL_URL})`
    )
    // Absent on GitHub and withheld by GitHub are the same 404 upstream: BOTH are named, neither is claimed.
    expect(offer.text).not.toContain("private")
    expect(offer.text).not.toContain("no such repository")
    expect(offer.text).not.toContain("does not exist")
  })

  /* M-48: the notice states the reader's situation, never this deployment's wiring. */
  test("the offer never explains the deployment to the reader", () => {
    for (const status of [
      { installed: true, configured: true, installUrl: null },
      { installed: false, configured: false, installUrl: INSTALL_URL },
      { installed: false, configured: false, installUrl: null },
      undefined
    ]) {
      const { text } = missingRepositoryOffer("acme/widgets", status)
      for (const word of ["deployment", "catalog", "endpoint", "backend", "route"]) expect(text).not.toContain(word)
      expect(text.split("\n")[0]!.length).toBeLessThanOrEqual(120)
    }
  })

  test("an install page that is not github.com is never linked, and Retry stands in its place", () => {
    for (const url of ["http://github.com/apps/smithers", "https://github.com.evil.example/apps", "javascript:alert(1)", "not a url"]) {
      const offer = missingRepositoryOffer("acme/widgets", { installed: false, configured: false, installUrl: url })
      expect(offer.text).not.toContain(url)
      expect(offer.text).toBe("Smithers doesn't have acme/widgets, and the Smithers GitHub App doesn't cover it for your account."
        + "\n\nIt may not exist on GitHub, or may not be accessible to this account.")
      expect(offer.action).toEqual({ flow: "github", args: JSON.stringify({ operation: "app-status", repo: "acme/widgets" }), label: "Retry" })
    }
  })

  /* `app-status` is the one `github` operation with no owner preflight, so an ordinary reader can run the retry offered. */
  test("an unread coverage door says that, and its one act re-reads the door", () => {
    const offer = missingRepositoryOffer("acme/widgets", undefined)
    expect(offer.kind).toBe("unknown")
    expect(offer.text).toBe("Smithers doesn't have acme/widgets, and couldn't check whether it can import it.")
    expect(offer.action).toEqual({ flow: "github", args: JSON.stringify({ operation: "app-status", repo: "acme/widgets" }), label: "Retry" })
  })

  test("an installed App whose configuration is incomplete is not an import offer", () => {
    const blocked = missingRepositoryOffer("acme/widgets", { installed: true, configured: false, installUrl: INSTALL_URL })
    expect(blocked.kind).toBe("install")
    /*
     * The App's own lookup named this repository, so it EXISTS: the sentence
     * must not offer absence as a reading, and must not call it private.
     */
    expect(blocked.text).toBe(
      "Smithers doesn't have acme/widgets yet. The Smithers GitHub App is installed on it, but it can't read it for your account."
      + `\n\n[Open the Smithers GitHub App installation](${INSTALL_URL})`
    )
    for (const word of ["may not exist", "private", "no such repository", "does not exist"]) {
      expect(blocked.text.toLowerCase()).not.toContain(word)
    }
    /* With no page to link, the honest act is to read the door again. */
    expect(missingRepositoryOffer("acme/widgets", { installed: true, configured: false, installUrl: null }).action)
      .toEqual({ flow: "github", args: JSON.stringify({ operation: "app-status", repo: "acme/widgets" }), label: "Retry" })
  })
})

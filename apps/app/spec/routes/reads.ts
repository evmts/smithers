import { z } from "zod"
import { AppBootstrapSchema } from "@smthrs/rpc/AppBootstrap"
import { ApplicationUserSchema } from "@smthrs/rpc/ApplicationAuth"
import { RepositoryHomeSchema } from "@smthrs/rpc/RepositoryHome"
import { RepositoryGuestSchema, RepositoryReadErrorSchema, RepositoryMetadataSchema, PublicRepositoriesSchema, RepositoryContentsSchema, RepositoryBookmarksSchema, RepositoryIssuesSchema, RepositoryGithubIssuesSchema, RepositoryIssueViewsSchema } from "@smthrs/rpc/RepositoryRead"
import { route } from "../route"
import type { FixtureRequest } from "../route"
import type { World } from "../world"
const metadata = (name: string) => ({ is_public: true, owner: name.split("/")[0], name: name.split("/")[1], full_name: name, default_bookmark: "main", owner_type: "Organization" })
const repo = (req: FixtureRequest, w: World) => w.repos.find(r => r.name === `${req.params.owner}/${req.params.repo}`)
const missing = { status: 404, body: { message: "Not found in this world" } }
const answer = (body: unknown) => ({ body })
const data = (w: World) => w.variants.data === "full"
export const readRoutes = [
  route({ method: "GET", path: "/api/bootstrap", control: true, schema: AppBootstrapSchema, handle: (_, w) => answer({ apiVersion: 1, host: "cloud", version: "spec", buildSha: "spec", capabilities: w.capabilities, authFlow: "redirect", sandbox: null }) }),
  route({ method: "GET", path: "/api/user", control: true, schema: z.union([ApplicationUserSchema, RepositoryReadErrorSchema]), handle: (_, w) => w.viewer ? answer({ id: 1, username: w.viewer.username, is_admin: false }) : { status: 401, body: { message: "authentication required" } } }),
  route({ method: "GET", path: "/api/public/repos", schema: PublicRepositoriesSchema, handle: (_, w) => answer({ repos: data(w) ? w.repos.map(r => ({ name: r.name })) : [] }) }),
  route({ method: "GET", path: "/api/user/repos", schema: z.array(RepositoryMetadataSchema), handle: (_, w) => answer(data(w) ? w.repos.map(r => metadata(r.name)) : []) }),
  route({ method: "GET", path: "/api/repos/:owner/:repo", schema: z.union([RepositoryMetadataSchema, RepositoryReadErrorSchema]), handle: (req, w) => { const r = repo(req, w); return r ? answer(metadata(r.name)) : missing } }),
  route({ method: "GET", path: "/api/repos/:owner/:repo/guest", schema: RepositoryGuestSchema, handle: () => answer({ allowed: false }) }),
  route({ method: "GET", path: "/api/repos/:owner/:repo/home", schema: z.union([RepositoryHomeSchema, RepositoryReadErrorSchema]), handle: (req, w) => { const r = repo(req, w); return r ? answer(data(w) ? r.home : { kind: "none" }) : missing } }),
  ...["/api/repos/:owner/:repo/contents", "/api/repos/:owner/:repo/contents/*path"].map(path => route({ method: "GET", path, schema: z.union([RepositoryContentsSchema, RepositoryReadErrorSchema]), handle: (req, w) => {
    const r = repo(req, w)
    if (!r) return missing
    const path = req.params.path ?? ""
    const content = r.files[path]
    if (content !== undefined) return answer({ type: "file", path, content, encoding: "utf-8" })
    const prefix = path === "" ? "" : `${path}/`
    const names = [...new Set(Object.keys(r.files).filter(p => p.startsWith(prefix)).map(p => p.slice(prefix.length).split("/")[0]!))]
    if (!names.length && path !== "") return missing
    return answer(data(w) ? names.map(name => { const p = prefix + name; const file = r.files[p]; return { name, path: p, type: file === undefined ? "dir" : "file", size: file === undefined ? 0 : new TextEncoder().encode(file).length } }) : [])
  } })),
  route({ method: "GET", path: "/api/repos/:owner/:repo/bookmarks", schema: RepositoryBookmarksSchema, handle: () => answer({ items: [{ name: "main", target_change_id: "spec-change", target_commit_id: "a".repeat(40), is_tracking_remote: false }], next_cursor: "" }) }),
  route({ method: "GET", path: "/api/repos/:owner/:repo/issues", schema: RepositoryIssuesSchema, handle: (req, w) => answer(data(w) ? (repo(req, w)?.issues ?? []).filter(i => !req.url.searchParams.has("state") || req.url.searchParams.get("state") === i.state).map(i => ({ ...i, author: { login: "maya" }, labels: [], comment_count: 0, updated_at: w.clock })) : []) }),
  route({ method: "GET", path: "/api/repos/:owner/:repo/issue-views", schema: RepositoryIssueViewsSchema, handle: () => answer([]) }),
  route({ method: "GET", path: "/api/user/github-repos/:owner/:repo/issues", schema: RepositoryGithubIssuesSchema, handle: () => answer([]) })
]

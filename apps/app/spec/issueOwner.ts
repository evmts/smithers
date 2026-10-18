export interface IssueOwner { readonly state: "open" | "closed"; readonly createdAt: string }
export type IssueOwnerReader = (reference: string) => Promise<IssueOwner>
/** Read only. Unknown ownership fails closed; credentials never enter receipts. */
export const issueOwner = (token: string, repository = "smithersai/smithers", request: typeof fetch = fetch): IssueOwnerReader => async reference => {
  const match = /^(?:https:\/\/github.com\/([\w.-]+\/[\w.-]+)\/issues\/|([\w.-]+\/[\w.-]+)#|issue#|#)(\d+)$/.exec(reference)
  if (!match) throw new Error("Invalid issue reference")
  if (!token) throw new Error("Issue token required")
  const response = await request(`https://api.github.com/repos/${match[1] ?? match[2] ?? repository}/issues/${match[3]}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }, redirect: "error", signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`Issue read failed (${response.status})`)
  const body = await response.json() as { state?: unknown; created_at?: unknown; pull_request?: unknown }
  if (body.pull_request || !["open", "closed"].includes(String(body.state)) || typeof body.created_at !== "string" || !Number.isFinite(Date.parse(body.created_at))) throw new Error("Invalid issue response")
  return { state: body.state as IssueOwner["state"], createdAt: body.created_at }
}

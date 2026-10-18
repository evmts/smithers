import { navigate } from "../../core/router"
import { repo, to } from "../../repo/fixtures"
import { registerSlash } from "../../repo/frame/slash"

export const planRoute = (location: string, action?: "preview" | "prepare") => {
  const query = new URLSearchParams(location.split("?")[1])
  for (const field of ["screen", "existing", "preparing", "failed", "stale", "preview", "act", "q", "page"]) query.delete(field)
  if (action === "preview") query.set("preview", "1")
  if (action === "prepare") query.set("act", "prepare")
  return to(`releases/plan${query.size ? `?${query}` : ""}`)
}

for (const action of ["preview", "prepare"] as const) registerSlash(`release.${action}`, {
  purpose: action === "preview" ? "Preview release" : "Prepare version PR",
  access: action === "preview" ? "public" : "member", fields: [], confirm: false,
  run: (_, { location, closeAsk }) => {
    closeAsk()
    if (repo.config.packages) navigate(planRoute(location, action))
    else navigate(to("releases"))
  }
})

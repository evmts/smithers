import { LinkTabs } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { Link } from "@tanstack/react-router"
import { CODE_TAB, HOME_TAB } from "../contract"
import { homePageOf, tabsOf } from "../view"
import { useHome } from "./HomeContext"

// The repository's Home and Code tabs, when a home shows: Home is `/$owner/$repo`, Code the tree at the default branch.
// Nothing shows for a repository without one, whose page is its tree.
export function HomeTabs({ active }: { readonly active: "home" | "code" }) {
  const { queries } = useHome()
  const { data } = useLiveQuery(queries.home)
  const tabs = data === undefined ? undefined : tabsOf(homePageOf(data.current, data.home, data.curated), data.current)
  if (tabs === undefined) return null
  return (
    <LinkTabs className="home-tabs" aria-label="Repository pages">
      <Link to="/$owner/$repo" params={{ owner: tabs.owner, repo: tabs.repo }} aria-current={active === "home" ? "page" : undefined}>
        {HOME_TAB}
      </Link>
      <Link to="/$owner/$repo/tree/$ref/$" params={tabs} aria-current={active === "code" ? "page" : undefined}>
        {CODE_TAB}
      </Link>
    </LinkTabs>
  )
}

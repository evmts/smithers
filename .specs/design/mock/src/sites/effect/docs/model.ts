import { docs, file, repo } from "../../repo/fixtures"
import type { DocPage, PackageInfo } from "../../repo/fixtures/types"
import scenario from "./scenarios.json"

export const slugFor = (pkg: PackageInfo) => pkg.slug ?? pkg.name.replace(/^@/, "").replace(/\//g, "-")
export const packageForPage = (path: string) => repo.config.packages?.find(pkg => slugFor(pkg) === path.split("/")[0])

/** Dataset docs supply curated pages; other available READMEs remain first-class documents. */
export const pagesFor = (pkg: PackageInfo): DocPage[] => {
  const slug = slugFor(pkg)
  const pages = docs.filter(page => page.slug === slug || page.slug.startsWith(`${slug}/`))
  const readme = pkg.readme && file(pkg.readme)
  if (!pages.some(page => page.slug === slug) && readme) {
    return [{ slug, title: pkg.name, section: "Packages", body: readme.content }, ...pages]
  }
  return pages
}

export const sourceFor = (page: DocPage, pkg?: PackageInfo): string | undefined => {
  const link = page.body.match(/smithers\.sh\/[^/]+\/[^/]+\/blob\/[^/]+\/([^\s)]+)/)?.[1]
  if (link) return link
  if (pkg && page.slug === slugFor(pkg)) return pkg.readme
  return scenario.guideSources[page.slug as keyof typeof scenario.guideSources]
}

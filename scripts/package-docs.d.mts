/** The retired library docs sites and their redirect targets (T-DOC-04, #3510). */
export const REPOSITORY_URL: string
export const README_URL: string
export const ZONE: string
export const legacySites: ReadonlyArray<readonly [slug: string, npmName: string]>
export const buildRedirectMap: (root?: string) => Readonly<Record<string, string>>
export const sitePathOf: (file: string) => string
export const pagesOf: (root: string, dir: string) => Readonly<Record<string, string>>
export const buildPageMap: (root?: string) => Readonly<Record<string, Readonly<Record<string, string>>>>
export const redirectMapOf: () => Readonly<Record<string, string>>
export const pageMapOf: () => Readonly<Record<string, Readonly<Record<string, string>>>>
export const sites: ReadonlyArray<{ dir: string; name: string; slug: string; title: string; description: string; domain: string }>
export const expectedLocation: (slug: string | null, path: string | null) => string
export const GENERATED_MODULE: string
export const renderModule: (
  map: Readonly<Record<string, string>>,
  pages: Readonly<Record<string, Readonly<Record<string, string>>>>
) => string

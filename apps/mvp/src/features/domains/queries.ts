import { type Collection, LiveQuery } from "@smthrs/effect-tanstack-db"
import type { Domain, DomainSave, DomainsPage } from "./schema"

// What frontends read about custom domains (docs/features/domains.md): the page's repository, its domains and this
// tab's writes that haven't landed.

/** The repository the Settings page shows. */
export const pageQuery = (page: Collection.Collection<DomainsPage, string>) =>
  LiveQuery.make((q) => q.from({ page: page.tanstack }).findOne())

/** The page's domains, by hostname. */
export const listQuery = (list: Collection.Collection<Domain, string>) =>
  LiveQuery.make((q) => q.from({ domain: list.tanstack }).orderBy(({ domain }) => domain.hostname))

/** This tab's writes that haven't landed. */
export const savesQuery = (saves: Collection.Collection<DomainSave, string>) =>
  LiveQuery.make((q) => q.from({ save: saves.tanstack }).select(({ save }) => save))

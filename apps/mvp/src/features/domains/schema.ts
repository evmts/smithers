import { Schema } from "effect"
import { CERTIFICATE_STATES, DOMAIN_STATES, VERIFICATION_STATES } from "./contract"

// Custom domains' rows on the tab (decision 0039, docs/features/domains.md): the `domains` row Electric delivers to a
// Maintainer or Admin, the repository the Settings page shows, and this tab's writes that haven't landed. None is kept
// on the device: a domain's state is the server's, and only a Maintainer's tab reads it while the page shows.

/** One DNS record the maintainer adds at their DNS provider. */
export const DnsRecord = Schema.Struct({
  type: Schema.Literals(["CNAME", "ALIAS", "TXT"]),
  name: Schema.String,
  value: Schema.String,
})
export type DnsRecord = typeof DnsRecord.Type

/**
 * One row of Postgres `domains` as Electric delivers it, columns in camelCase: the hostname, its repository, its state,
 * verification's and the certificate's, the records to add, why it isn't active (`problem`) and when it was last
 * checked.
 */
export const Domain = Schema.Struct({
  hostname: Schema.String,
  repoId: Schema.String,
  state: Schema.Literals(DOMAIN_STATES),
  verification: Schema.Literals(VERIFICATION_STATES),
  certificate: Schema.Literals(CERTIFICATE_STATES),
  records: Schema.Array(DnsRecord),
  problem: Schema.NullOr(Schema.String),
  checkedAt: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
})
export type Domain = typeof Domain.Type

/** What a write does: add a domain, check it again, or remove it. */
export const DomainOp = Schema.Literals(["add", "refresh", "remove"])
export type DomainOp = typeof DomainOp.Type

/**
 * This tab's last write of a hostname: still `saving`, or `failed` with ChatApi's refusal code (`unavailable` when it
 * couldn't be reached). A write that lands is removed.
 */
export const DomainSave = Schema.Struct({
  hostname: Schema.String,
  op: DomainOp,
  state: Schema.Literals(["saving", "failed"]),
  code: Schema.NullOr(Schema.String),
})
export type DomainSave = typeof DomainSave.Type

/** The one row naming the repository the Settings page shows; empty until a page opens one. */
export const DomainsPage = Schema.Struct({
  id: Schema.Literal("page"),
  owner: Schema.String,
  name: Schema.String,
})
export type DomainsPage = typeof DomainsPage.Type

/** `domain/add`'s and `domain/remove`'s payload: the repository and the hostname. */
export const DomainRequest = Schema.Struct({ owner: Schema.String, name: Schema.String, hostname: Schema.String })
export type DomainRequest = typeof DomainRequest.Type

import { Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import type { Role } from "../src/features/auth/contract.ts"

// Sign-in's rows in Postgres (docs/features/sign-in.md#postgres): people, sign-ins in progress and sessions. Postgres'
// clock decides every expiry. Each function is one statement, or one transaction, against the `SqlClient` in context.

/** A sealed value as a row holds it (`@smthrs/control`'s `CredentialCipher.Sealed`). */
export const Sealed = Schema.Struct({ ciphertext: Schema.String, nonce: Schema.String })
export type Sealed = typeof Sealed.Type

const decodeSealed = Schema.decodeUnknownSync(Sealed)
const sealedOrNull = (value: unknown) => (value === null ? null : decodeSealed(value))
const json = (value: Sealed | null) => (value === null ? null : JSON.stringify(value))
const millis = (value: string | null) => (value === null ? null : Number(value))

/**
 * Why a session ended early: the person signed out, GitHub refused its tokens, or its sealed tokens no longer open
 * (SESSION_SECRET changed).
 */
export type RevokedReason = "sign_out" | "github_refused" | "unreadable"

/** Records a sign-in in progress for `ttlSeconds`, after deleting every one past its expiry. */
export const beginAttempt = (attempt: {
  readonly stateDigest: string
  readonly verifier: Sealed
  readonly redirectUri: string
  readonly returnTo: string
  readonly ttlSeconds: number
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`DELETE FROM sign_in_attempts WHERE expires_at < now()`
    yield* sql`
      INSERT INTO sign_in_attempts (state_digest, verifier, redirect_uri, return_to, expires_at)
      VALUES (${attempt.stateDigest}, ${json(attempt.verifier)}::jsonb, ${attempt.redirectUri}, ${attempt.returnTo},
        now() + make_interval(secs => ${attempt.ttlSeconds}))`
  })

/**
 * Takes the sign-in `state` started, once: the row is deleted as it is read, so a replayed callback finds nothing.
 * `live` is false when it was past its expiry.
 */
export const takeAttempt = (stateDigest: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{
      readonly verifier: unknown
      readonly redirectUri: string
      readonly returnTo: string
      readonly live: boolean
    }>`
      DELETE FROM sign_in_attempts WHERE state_digest = ${stateDigest}
      RETURNING verifier, redirect_uri AS "redirectUri", return_to AS "returnTo", expires_at > now() AS live`
    return Option.map(Option.fromNullishOr(row), (found) => ({ ...found, verifier: decodeSealed(found.verifier) }))
  })

/** The person with GitHub's numeric id `githubId`, created or with their login brought up to date; returns their id. */
export const upsertPerson = (person: { readonly id: string; readonly githubId: number; readonly login: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly id: string }>`
      INSERT INTO people (id, github_id, github_login) VALUES (${person.id}, ${person.githubId}, ${person.login})
      ON CONFLICT (github_id) DO UPDATE SET github_login = EXCLUDED.github_login, updated_at = now()
      RETURNING id`
    return row!.id
  })

/** A new session, its role checked now, ending `maxAgeSeconds` from now. */
export const createSession = (session: {
  readonly id: string
  readonly tokenDigest: string
  readonly personId: string
  readonly role: Role | null
  readonly access: Sealed
  readonly accessExpiresAt: number | null
  readonly refresh: Sealed | null
  readonly refreshDigest: string | null
  readonly maxAgeSeconds: number
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO sessions (id, token_digest, person_id, role, role_checked_at, github_access, github_access_expires_at,
        github_refresh, github_refresh_digest, expires_at)
      VALUES (${session.id}, ${session.tokenDigest}, ${session.personId}, ${session.role}, now(),
        ${json(session.access)}::jsonb,
        ${session.accessExpiresAt === null ? null : new Date(session.accessExpiresAt).toISOString()}::timestamptz,
        ${json(session.refresh)}::jsonb, ${session.refreshDigest},
        now() + make_interval(secs => ${session.maxAgeSeconds}))`
  })

/** A live session: its id, its person's id and login, its role and when the role was last checked (epoch ms). */
export interface Live {
  readonly id: string
  readonly personId: string
  readonly login: string
  readonly role: Role | null
  readonly roleCheckedAt: number
}

/** The live session whose token has `tokenDigest`: not signed out, not revoked and not past its end. */
export const findLive = (tokenDigest: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<Omit<Live, "roleCheckedAt"> & { readonly roleCheckedAt: string }>`
      SELECT s.id, s.person_id AS "personId", p.github_login AS login, s.role,
        (extract(epoch FROM s.role_checked_at) * 1000)::bigint::text AS "roleCheckedAt"
      FROM sessions s JOIN people p ON p.id = s.person_id
      WHERE s.token_digest = ${tokenDigest} AND s.revoked_at IS NULL AND s.expires_at > now()`
    return Option.map(Option.fromNullishOr(row), (found): Live => ({
      ...found,
      roleCheckedAt: Number(found.roleCheckedAt),
    }))
  })

/**
 * Ends the session with this id, or whose token has this digest, for `reason`. Returns the id of the session that
 * ended, `None` when none was live. A session GitHub refused, or whose tokens no longer open, forgets its GitHub tokens
 * at once; a signed-out one keeps them sealed until `auth/RevokeGitHubToken` revokes them on GitHub and calls
 * `forgetTokens`.
 */
export const revoke = (
  session: { readonly id: string } | { readonly tokenDigest: string },
  reason: RevokedReason,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const match = "id" in session ? sql`id = ${session.id}` : sql`token_digest = ${session.tokenDigest}`
    const rows = yield* (reason === "sign_out"
      ? sql<{ readonly id: string }>`
        UPDATE sessions SET revoked_at = now(), revoked_reason = ${reason}
        WHERE ${match} AND revoked_at IS NULL
        RETURNING id`
      : sql<{ readonly id: string }>`
        UPDATE sessions SET revoked_at = now(), revoked_reason = ${reason}, github_access = NULL,
          github_access_expires_at = NULL, github_refresh = NULL, github_refresh_digest = NULL
        WHERE ${match} AND revoked_at IS NULL
        RETURNING id`)
    return Option.map(Option.fromNullishOr(rows[0]), (row) => row.id)
  })

/** Forgets session `id`'s GitHub tokens, once it has ended: a live session keeps them. */
export const forgetTokens = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      UPDATE sessions SET github_access = NULL, github_access_expires_at = NULL, github_refresh = NULL,
        github_refresh_digest = NULL
      WHERE id = ${id} AND (revoked_at IS NOT NULL OR expires_at <= now())`
  })

/** What a role check reads of a session: whether it is live, and its sealed GitHub tokens. */
export interface Held {
  readonly live: boolean
  readonly access: Sealed | null
  readonly accessExpiresAt: number | null
  readonly refresh: Sealed | null
  readonly refreshDigest: string | null
}

/** Session `id`'s GitHub tokens, or `None` when there is no such session. */
export const held = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{
      readonly live: boolean
      readonly access: unknown
      readonly accessExpiresAt: string | null
      readonly refresh: unknown
      readonly refreshDigest: string | null
    }>`
      SELECT revoked_at IS NULL AND expires_at > now() AS live, github_access AS access,
        (extract(epoch FROM github_access_expires_at) * 1000)::bigint::text AS "accessExpiresAt",
        github_refresh AS refresh, github_refresh_digest AS "refreshDigest"
      FROM sessions WHERE id = ${id}`
    return Option.map(Option.fromNullishOr(row), (found): Held => ({
      live: found.live,
      access: sealedOrNull(found.access),
      accessExpiresAt: millis(found.accessExpiresAt),
      refresh: sealedOrNull(found.refresh),
      refreshDigest: found.refreshDigest,
    }))
  })

/**
 * Replaces session `id`'s GitHub tokens, only while it still holds the refresh token whose digest is `presented`.
 * Returns false when another refresh replaced it first, or the session ended.
 */
export const replaceTokens = (
  id: string,
  presented: string,
  next: {
    readonly access: Sealed
    readonly accessExpiresAt: number | null
    readonly refresh: Sealed | null
    readonly refreshDigest: string | null
  },
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`
      UPDATE sessions SET github_access = ${json(next.access)}::jsonb,
        github_access_expires_at = ${
      next.accessExpiresAt === null ? null : new Date(next.accessExpiresAt).toISOString()
    }::timestamptz,
        github_refresh = ${json(next.refresh)}::jsonb, github_refresh_digest = ${next.refreshDigest}
      WHERE id = ${id} AND revoked_at IS NULL AND github_refresh_digest = ${presented}
      RETURNING id`
    return rows.length > 0
  })

/** Records session `id`'s role, checked now. */
export const setRole = (id: string, role: Role | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`UPDATE sessions SET role = ${role}, role_checked_at = now() WHERE id = ${id} AND revoked_at IS NULL`
  })

/**
 * Keeps session `id`'s role and records a check now, after one that couldn't reach GitHub or Postgres: the role stays
 * until the next check, which starts once this one is `ROLE_RECHECK_MINUTES` old.
 */
export const keepRole = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`UPDATE sessions SET role_checked_at = now() WHERE id = ${id} AND revoked_at IS NULL`
  })

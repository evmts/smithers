// Postgres in production: one Neon project. infra/ChatDatabase.ts migrates it and puts Hyperdrive in front of it;
// Electric's container (infra/ElectricGateway.ts) replicates from it. Under `alchemy dev` it doesn't exist: the
// compose Postgres (`pnpm db:up`) stands in.
import * as Alchemy from "alchemy"
import * as Neon from "alchemy/Neon"
import * as Output from "alchemy/Output"
import { Config, Effect, Option, Redacted } from "effect"

/**
 * The production database: Postgres 17 with logical replication on, which Electric's replication needs. Its region and
 * Postgres version can't change after creation, so they are fixed here rather than configured. It is created in the
 * Neon organization `NEON_ORG_ID`, which a personal API key needs and an organization API key implies.
 * `alchemy destroy` keeps it: the conversation outlives any deploy.
 */
export const Postgres = Neon.Project(
  "ChatPostgres",
  Effect.gen(function* () {
    const orgId = yield* Config.option(Config.String("NEON_ORG_ID"))
    return {
      region: "aws-us-east-1" as const,
      pgVersion: 17 as const,
      enableLogicalReplication: true,
      ...(Option.isSome(orgId) ? { orgId: orgId.value } : {}),
    }
  }).pipe(Effect.orDie),
).pipe(Alchemy.RemovalPolicy.retain())

/**
 * The project's direct (non-pooled) connection URI with `sslmode=require`, as a secret. Neon's URI also asks for
 * `channel_binding`, which Electric's URL parser doesn't take, so it is dropped; TLS still verifies the server.
 */
export const directUrl = (postgres: Neon.Project) =>
  Output.map(postgres.connectionUri, (uri: string) => {
    const url = new URL(uri)
    url.searchParams.delete("channel_binding")
    return Redacted.make(url.toString())
  })

import { Core, GitHub } from "@smthrs/integrations"
import { Effect, Schema } from "effect"

const Issue = Schema.Struct({ number: Schema.Number, title: Schema.String })

/**
 * Lists the titles of a repository's open issues, following GitHub's
 * `Link: rel="next"` pages up to a page budget.
 *
 * @param client - A client from `GitHub.GitHubClient.make`.
 * @param owner - The account that owns the repository.
 * @param repo - The repository name.
 * @returns The titles in page order, and whether the page budget cut the
 *   listing short. Fails with an `IntegrationError`: `invalid-config` for an
 *   owner or repository GitHub could not have issued, `delivery-failed` for a
 *   refused request, and `decode-failed` for an item that is not an issue.
 * @since 1.0.0
 */
export const listOpenIssueTitles = (
  client: GitHub.GitHubClient.GitHubClient,
  owner: string,
  repo: string
) =>
  Effect.gen(function*() {
    const repository = yield* GitHub.Repository.requireRepositoryPath(owner, repo)
    const page = yield* client.paginate(`/repos/${repository}/issues?state=open`, { maxPages: 5 })
    const issues = yield* Schema.decodeUnknownEffect(Schema.Array(Issue))(page.items).pipe(
      Effect.mapError((cause) =>
        new Core.IntegrationError.IntegrationError("decode-failed", "GitHub returned an item that is not an issue.", {
          retryable: false
        }, { cause })
      )
    )
    return { titles: issues.map((issue) => issue.title), truncated: page.truncated }
  })

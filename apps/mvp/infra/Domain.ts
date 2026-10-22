// The hostname a production deployment serves the app at, `APP_DOMAIN`. The deployment supplies it with its other
// identifiers; the public stack names no domain of its own (docs/infrastructure.md#domain).
import { Config, Data, Effect, Option } from "effect"
import { DOCS_SITE_PATHS } from "../src/pwa.ts"

/** `APP_DOMAIN`'s value for a deployment served only at its `workers.dev` URL, with no custom domain and no docs site. */
export const WORKERS_DEV = "workers.dev"

/** A lowercase DNS name with at least two labels, such as `example.com` or `app.example.com`. */
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/**
 * A production deploy without a usable `APP_DOMAIN`. Unset is refused rather than read as "no domain": a deploy that
 * dropped it would detach the hostname's docs site, so the choice is spelled out every time.
 */
export class AppDomainInvalid extends Data.TaggedError("AppDomainInvalid")<{ readonly value: string | undefined }> {
  override get message() {
    return this.value === undefined
      ? `APP_DOMAIN is unset. Set it to the hostname the app serves at, such as example.com, or to ${WORKERS_DEV} ` +
          "to serve it only at its workers.dev URL (docs/infrastructure.md#domain)."
      : `APP_DOMAIN is "${this.value}": it must be a hostname such as example.com, with no scheme, port or path, ` +
          `or ${WORKERS_DEV} (docs/infrastructure.md#domain).`
  }
}

/**
 * The custom domain a production deploy attaches the app to: `APP_DOMAIN`, or none when it is `workers.dev`. Fails
 * with {@link AppDomainInvalid} when it is unset or isn't a hostname.
 */
export const AppDomain: Effect.Effect<Option.Option<string>, AppDomainInvalid | Config.ConfigError> = Effect.gen(
  function* () {
    const value = yield* Config.option(Config.String("APP_DOMAIN"))
    if (Option.isNone(value)) return yield* new AppDomainInvalid({ value: undefined })
    if (value.value === WORKERS_DEV) return Option.none()
    if (!HOSTNAME.test(value.value)) return yield* new AppDomainInvalid({ value: value.value })
    return Option.some(value.value)
  },
)

/**
 * The docs site's zone routes on `domain`, one for each path it serves there (infra/DocsSite.ts). Cloudflare runs a
 * route before the domain's Worker, so these paths are the docs site's and every other one stays the app's.
 */
export const docsRoutes = (domain: string) => DOCS_SITE_PATHS.map((path) => ({ pattern: `${domain}${path}` }))

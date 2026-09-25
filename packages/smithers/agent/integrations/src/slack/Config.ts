/**
 * Slack app credentials and client limits.
 *
 * A Slack app holds up to three secrets: the bot token (`xoxb-`) that every
 * Web API call except one carries, the app-level token (`xapp-`) that only
 * `apps.connections.open` accepts, and the signing secret the Events API signs
 * each delivery with. Each falls back to its own `SMITHERS_SLACK_*` variable.
 * An explicit `env` replaces the ambient environment rather than layering over
 * it, so a caller that supplies its own credentials cannot have an ambient
 * token decide which workspace a call reaches.
 *
 * Every limit is validated here, once, so a client never starts with a budget
 * that is unbounded, fractional, or negative. A failure names the field and
 * never carries token material.
 *
 * @since 0.1.0
 */
import { Duration, Option } from "effect"
import { IntegrationError } from "../core/IntegrationError.ts"
import * as Environment from "../Environment.ts"

/**
 * The public Web API base URL. A method is posted to `<base>/<method>`.
 *
 * @category constants
 * @since 0.1.0
 */
export const DEFAULT_API_BASE_URL = "https://slack.com/api"

/**
 * The default deadline for one attempt, covering the response headers and the
 * body read.
 *
 * @category constants
 * @since 0.1.0
 */
export const DEFAULT_REQUEST_TIMEOUT: Duration.Duration = Duration.seconds(30)

/**
 * The default first delay of the backoff between retried reads.
 *
 * @category constants
 * @since 0.1.0
 */
export const DEFAULT_RETRY_BASE_DELAY: Duration.Duration = Duration.millis(250)

/**
 * The environment variable names this module reads.
 *
 * @category constants
 * @since 0.1.0
 */
export const ENV = {
  botToken: "SMITHERS_SLACK_BOT_TOKEN",
  appToken: "SMITHERS_SLACK_APP_TOKEN",
  signingSecret: "SMITHERS_SLACK_SIGNING_SECRET",
  apiBaseUrl: "SMITHERS_SLACK_API_BASE_URL"
} as const

/**
 * What a caller may supply. Every field is optional; each consumer fails with
 * a typed error when a value it needs is missing.
 *
 * @category models
 * @since 0.1.0
 */
export interface SlackConfig {
  /** The bot token. Falls back to `SMITHERS_SLACK_BOT_TOKEN`. Never logged. */
  readonly botToken?: string | undefined
  /** The app-level token for Socket Mode. Falls back to `SMITHERS_SLACK_APP_TOKEN`. Never logged. */
  readonly appToken?: string | undefined
  /** The Events API signing secret. Falls back to `SMITHERS_SLACK_SIGNING_SECRET`. */
  readonly signingSecret?: string | undefined
  /** The Web API base URL, for a fixture server. Falls back to `SMITHERS_SLACK_API_BASE_URL`. */
  readonly apiBaseUrl?: string | undefined
  /** Automatic retries of a rate-limited call, for every method. Defaults to 3; 0 to 10. */
  readonly maxRateLimitRetries?: number | undefined
  /** Cap on an honored `Retry-After`, in seconds. Defaults to 30; 0 to 300. */
  readonly maxRetryAfterSeconds?: number | undefined
  /** Retries of a read that met a 5xx, a dropped connection, or a timeout. Defaults to 3; 0 to 10. */
  readonly maxRetries?: number | undefined
  /** The first backoff delay between retried reads, doubled per retry. Defaults to 250 ms. */
  readonly retryBaseDelay?: Duration.Input | undefined
  /** Deadline for one attempt, headers and body. Defaults to 30 seconds; finite and positive. */
  readonly requestTimeout?: Duration.Input | undefined
}

/**
 * A config with every fallback applied and every limit validated.
 *
 * @category models
 * @since 0.1.0
 */
export interface ResolvedSlackConfig {
  readonly botToken: string | undefined
  readonly appToken: string | undefined
  readonly signingSecret: string | undefined
  /** Without a trailing slash. */
  readonly apiBaseUrl: string
  readonly maxRateLimitRetries: number
  readonly maxRetryAfterSeconds: number
  readonly maxRetries: number
  readonly retryBaseDelay: Duration.Duration
  readonly requestTimeout: Duration.Duration
}

const firstNonEmpty = (...candidates: ReadonlyArray<string | undefined>): string | undefined =>
  candidates.map((candidate) => typeof candidate === "string" ? candidate.trim() : "").find((value) => value.length > 0)

const invalid = (field: string, rule: string, value: unknown): IntegrationError =>
  new IntegrationError("invalid-config", `Slack ${field} must be ${rule}.`, {
    [field]: String(value),
    retryable: false
  })

const integer = (field: string, value: number | undefined, fallback: number, max: number): number => {
  const chosen = value ?? fallback
  if (!Number.isSafeInteger(chosen) || chosen < 0 || chosen > max) {
    throw invalid(field, `an integer from 0 to ${max}`, chosen)
  }
  return chosen
}

const duration = (
  field: string,
  value: Duration.Input | undefined,
  fallback: Duration.Duration,
  allowZero: boolean
): Duration.Duration => {
  const chosen = Option.getOrUndefined(Duration.fromInput(value ?? fallback))
  const millis = chosen === undefined || !Duration.isFinite(chosen) ? Number.NaN : Duration.toMillis(chosen)
  if (!(millis > 0 || (allowZero && millis === 0))) {
    throw invalid(field, allowZero ? "a finite duration" : "a finite, positive duration", value)
  }
  return chosen as Duration.Duration
}

/**
 * Resolves configuration: explicit values, then `env`.
 *
 * Throws `IntegrationError` with reason `invalid-config` for a base URL that
 * is not HTTP or HTTPS and for a limit outside its documented range. A missing
 * token is not an error here: a client used only for Socket Mode holds no bot
 * token, and the call that needs one fails `credentials-missing`.
 *
 * @category constructors
 * @since 0.1.0
 */
export const resolve = (
  config: SlackConfig = {},
  env: Readonly<Record<string, string | undefined>> = Environment.ambientEnvironment()
): ResolvedSlackConfig => {
  const apiBaseUrl = (firstNonEmpty(config.apiBaseUrl, env[ENV.apiBaseUrl]) ?? DEFAULT_API_BASE_URL)
    .replace(/\/+$/, "")
  const protocol = URL.canParse(apiBaseUrl) ? new URL(apiBaseUrl).protocol : ""
  if (protocol !== "http:" && protocol !== "https:") {
    throw invalid("apiBaseUrl", "an HTTP or HTTPS URL", apiBaseUrl)
  }
  return {
    botToken: firstNonEmpty(config.botToken, env[ENV.botToken]),
    appToken: firstNonEmpty(config.appToken, env[ENV.appToken]),
    signingSecret: firstNonEmpty(config.signingSecret, env[ENV.signingSecret]),
    apiBaseUrl,
    maxRateLimitRetries: integer("maxRateLimitRetries", config.maxRateLimitRetries, 3, 10),
    maxRetryAfterSeconds: integer("maxRetryAfterSeconds", config.maxRetryAfterSeconds, 30, 300),
    maxRetries: integer("maxRetries", config.maxRetries, 3, 10),
    retryBaseDelay: duration("retryBaseDelay", config.retryBaseDelay, DEFAULT_RETRY_BASE_DELAY, true),
    requestTimeout: duration("requestTimeout", config.requestTimeout, DEFAULT_REQUEST_TIMEOUT, false)
  }
}

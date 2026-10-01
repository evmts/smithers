/**
 * The signed-in Smithers Cloud session, for hosts other than the CLI: the
 * terminal UI reads the factory's issue list with it. The token comes from
 * where `smthrs auth login` put it (`SMITHERS_TOKEN`, then the keyring, the
 * auth file, the config), and the origin from `SMITHERS_API_ORIGIN` or the
 * configured `api_origin`. Nothing here stores or prints a token.
 *
 * @since 1.0.0
 */

import { pageText, paginationCursor } from "@smthrs/kernel/HttpPagination"
import { createHash } from "node:crypto"
import * as CliError from "./CliError.ts"
import { processHost, resolveRepo } from "./commands/Open.ts"
import { Session } from "./internal/backend/Session.ts"

/** A read that hangs gives up here. */
const timeoutMs = 30_000
/** A body larger than this is refused, as the CLI's own client refuses it. */
const maxBytes = 4 * 1024 * 1024

/**
 * An authenticated Cloud origin.
 *
 * @category models
 * @since 1.0.0
 */
export interface Cloud {
  readonly origin: string
  /** GETs `path` (starting `/api/`) as the signed-in person; resolves the parsed JSON body. */
  readonly get: (path: string, signal?: AbortSignal) => Promise<unknown>
  /** Reads the same JSON body with validated, same-query keyset continuation. */
  readonly getPage: (
    path: string,
    signal?: AbortSignal
  ) => Promise<{ readonly body: unknown; readonly nextCursor: string; readonly bytes: number }>
  /** POSTs the JSON `body` to `path` (starting `/api/`) as the signed-in person; resolves the parsed JSON body. */
  readonly post: (path: string, body: unknown, signal?: AbortSignal) => Promise<unknown>
}

/**
 * Selected authority for a retained request. The opaque binding is not a credential;
 * current re-resolves the same host selection without making a network request.
 * @category models
 * @since 1.0.0
 */
export interface SelectedCloud extends Cloud {
  readonly identity: string
  readonly current: () => Promise<boolean>
}

/**
 * The signed-in session, or undefined when there is no origin or no login.
 *
 * @category constructors
 * @since 1.0.0
 */
export const signedIn = async (
  env: Readonly<Record<string, string | undefined>>
): Promise<SelectedCloud | undefined> => {
  const session = new Session(env)
  let resolved: Awaited<ReturnType<Session["resolve"]>>
  try {
    resolved = await session.resolve()
  } catch {
    return undefined
  }
  if (resolved === undefined) return undefined
  const { api_url: origin, token } = resolved
  const call = async (
    method: "GET" | "POST",
    path: string,
    body: unknown,
    signal?: AbortSignal
  ): Promise<{ readonly body: unknown; readonly headers: Headers; readonly bytes: number }> => {
    // Only a path on this origin: the token never goes to another host.
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new CliError.Refused({
        fault: "bug",
        code: "cloud_path_refused",
        message: `Not a Cloud API path: ${path}`
      })
    }
    const timeout = AbortSignal.timeout(timeoutMs)
    const response = await fetch(origin + path, {
      method,
      headers: {
        authorization: `token ${token}`,
        accept: "application/json",
        ...(method === "POST" ? { "content-type": "application/json" } : {})
      },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    })
    if (!response.ok) {
      throw new CliError.Refused({
        fault: response.status === 401 || response.status === 403 ? "user" : "infra",
        code: "cloud_request_failed",
        message: `${path}: HTTP ${response.status}`
      })
    }
    const { text, bytes } = await pageText(response, maxBytes, () =>
      new CliError.Refused({
        fault: "infra",
        code: "cloud_response_too_large",
        message: `${path}: the response is larger than ${maxBytes} bytes`
      }))
    try {
      return { body: JSON.parse(text) as unknown, headers: response.headers, bytes }
    } catch {
      throw new CliError.Refused({
        fault: "infra",
        code: "cloud_response_invalid",
        message: `${path}: the response is not JSON`
      })
    }
  }
  return {
    origin,
    identity: createHash("sha256").update(origin).update("\0").update(token).digest("hex"),
    current: async () => {
      const current = await session.resolve()
      return current?.api_url === origin && current.token === token
    },
    get: async (path, signal) => (await call("GET", path, undefined, signal)).body,
    getPage: async (path, signal) => {
      const result = await call("GET", path, undefined, signal)
      return {
        body: result.body,
        bytes: result.bytes,
        nextCursor: paginationCursor(result.headers, new URL(path, origin), {
          preserveQuery: true,
          invalid: () =>
            new CliError.Refused({
              fault: "infra",
              code: "backend_protocol",
              message: "Cloud returned invalid pagination"
            })
        })
      }
    },
    post: async (path, body, signal) => (await call("POST", path, body, signal)).body
  }
}

/**
 * The Cloud repository a checkout names, `owner/name`, from its git or jj
 * remote the way `smthrs open` reads it; undefined when no remote names one.
 *
 * @category constructors
 * @since 1.0.0
 */
export const repository = (
  directory: string,
  env: Readonly<Record<string, string | undefined>>
): string | undefined => {
  try {
    return resolveRepo(processHost(env), directory)
  } catch {
    return undefined
  }
}

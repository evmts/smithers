/**
 * Whether a PostgreSQL endpoint is there to test against.
 *
 * @since 1.0.0
 */
import { connect } from "node:net"

/**
 * Resolves whether anything accepts TCP connections at `url`'s host and port.
 * Only a refused connection means the service is absent; any other error
 * rejects, so a misconfigured endpoint fails the suite instead of skipping it.
 *
 * @since 1.0.0
 * @category predicates
 */
export const listening = (url: string): Promise<boolean> => {
  const { hostname, port } = new URL(url)
  return new Promise((resolve, reject) => {
    const socket = connect({ host: hostname, port: Number(port || 5432) })
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once(
      "error",
      (error: NodeJS.ErrnoException) => error.code === "ECONNREFUSED" ? resolve(false) : reject(error)
    )
  })
}

/**
 * The compose PgBouncer (`apps/mvp/docker-compose.yml`): transaction pooling
 * over the compose PostgreSQL, with every server connection reset when its
 * transaction ends, as Cloudflare Hyperdrive does.
 *
 * @since 1.0.0
 * @category constants
 */
export const pgbouncerUrl = "postgres://smithers:smithers@127.0.0.1:54322/smithers"

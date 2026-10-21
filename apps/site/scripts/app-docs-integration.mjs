import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { appDocsImages } from "./sync-app-docs.mjs"

/*
 * The docs screenshots publish at /images/docs/ from their one directory,
 * apps/site/docs/app/images, beside the pages that show them.
 * `astro dev` answers them from that directory, and the static build copies
 * them in once it is on disk (`astro:build:done`). Only `<id>.light.webp` and
 * `<id>.dark.webp` publish: the capture manifest beside them stays private,
 * and a request names a file by that pattern or not at all, so no path
 * outside the directory can be reached.
 */
export const IMAGE_PREFIX = "/images/docs/"
const IMAGE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:light|dark)\.webp$/

/** The screenshot file names the site publishes, sorted; none when the directory is absent. */
export const publishedImages = (directory = appDocsImages) =>
  existsSync(directory) ? readdirSync(directory).filter((name) => IMAGE.test(name)).sort() : []

/** @returns {import("astro").AstroIntegration} */
export const appDocsAssets = () => ({
  name: "smithers-app-docs-images",
  hooks: {
    "astro:server:setup": ({ server }) => {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? "").split(/[?#]/)[0]
        const name = path.startsWith(IMAGE_PREFIX) ? path.slice(IMAGE_PREFIX.length) : ""
        if (!IMAGE.test(name) || !existsSync(join(appDocsImages, name))) return next()
        response.setHeader("content-type", "image/webp")
        createReadStream(join(appDocsImages, name)).pipe(response)
      })
    },
    "astro:build:done": ({ dir }) => {
      const names = publishedImages()
      const destination = fileURLToPath(new URL(IMAGE_PREFIX.slice(1), dir))
      if (names.length > 0) mkdirSync(destination, { recursive: true })
      for (const name of names) copyFileSync(join(appDocsImages, name), join(destination, name))
    }
  }
})

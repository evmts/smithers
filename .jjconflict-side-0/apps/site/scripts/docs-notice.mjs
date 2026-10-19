import { defineRouteMiddleware } from "@astrojs/starlight/route-data"

export const onRequest = defineRouteMiddleware(({ locals }, next) => {
  locals.starlightRoute.entry.data.banner ??= {
    content: 'Smithers 1.0 release candidate. <a href="https://github.com/smithersai/smithers/blob/main/packages/smithers/docs/installation.md#install-the-cli">Install from npm</a>.'
  }
  return next()
})

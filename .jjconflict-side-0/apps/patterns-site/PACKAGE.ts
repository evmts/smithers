/**
 * Targets for patterns.smithers.sh, the orchestration-patterns field guide.
 *
 * The page is one static file, `site/index.html`, served by the `patterns-site`
 * Worker (`wrangler.jsonc`). Its cards link into the whole repository, so the
 * link check reads files across packages and runs uncached, like
 * `//scripts:packageDocs`.
 */
import { Smithers } from "@smthrs/targets"

/**
 * Every card's source resolves to a file, directory, or heading on main, and
 * every use-case example has a card.
 *
 * @since 1.0.0
 * @category test
 */
const links = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//apps/patterns-site/links.test.mjs")]),
  srcs: [Smithers.glob("//apps/patterns-site/site/**")],
  deps: []
})

export const Package = Smithers.Package({ targets: { links } })

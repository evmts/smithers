---
"@smthrs/ui": minor
---

`WebLinkCard` shows an outside page as a polished card: its icon, title, description and domain, and an
`Open in new tab` link with a `↵` key (`aria-keyshortcuts="Enter"`). It takes `title`, `description` and `icon`, read
from the page's head by a server such as `@smthrs/views`' `WebPage.check`; the icon renders only for an `https:`
URL, with no referrer, and the host's first letter stands in when there is none or it fails to load. The domain is
the host for an `https:` page and the whole origin otherwise. The default `openLabel` is now `Open in new tab`, and
the origin slot `web-link-origin` is now `web-page-domain`.

`WebPageView` takes a `preview` and covers the frame with it until the frame loads (`data-state` `loading` or
`loaded`), fading in after 600 ms, so a page that never loads still says what it is. The frame now sits in a
`.sui-web-page-stage` wrapper. `WebPagePreview` is exported.

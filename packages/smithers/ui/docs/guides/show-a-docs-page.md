---
title: "Show a docs page"
description: "Show one page of a docs site from its Markdown with DocsPageView: its title, its site's origin, an Open on site link, and relative links that open on the site."
---

`DocsPageView` shows one page of a docs site from the page's Markdown, such as
a page an `llms.txt` index lists (`@smthrs/views`' `Docs`). It draws the
site's origin and an `Open on site` link in a bar, the page's title as a
heading, then the page. A page whose Markdown opens with its own `# ` heading
keeps that one as its title, so the title shows once.

```tsx
import { DocsPageView } from "@smthrs/ui"

<DocsPageView title="Retrying" url="https://vibelang.sh/error-management/018-retrying.md" text={markdown} />
<DocsPageView title={title} url={url} text={text} truncated size="full" headingLevel={1} />
```

- **The text is someone else's.** It renders through `Markdown`'s `document`
  variant: HTML tags show only their text, images show their alt text and
  load nothing, and link hrefs are scheme-filtered, so `javascript:` never
  becomes a link.
- **Links open on the docs site.** A relative link such as `/setup/vite.md`
  resolves against `url` (`Markdown`'s `baseUrl`), never against your app.
  Pass `onLinkClick` to handle a link yourself, for example to open another
  page of the same docs in your app.
- **The URL is checked.** `url` must be an absolute `https:` or `http:` URL
  with no username or password (`docsPageTarget`); anything else shows
  `Can't show this page`. Fetch the page on your server from its docs index,
  never from a URL a client chose.
- **Sizes.** `inline`, the default, bounds the page to 28rem and scrolls it,
  for a message; `full` fills its container, so give it a flex column or a
  full-height parent.
- **Shortened pages.** When you keep only the start of a long page, pass
  `truncated`; the view says `Shortened`, and `Open on site` has the rest.

---
title: "Show a web page"
description: "Show an outside web page in a sandboxed frame with WebPageView, or as a card that opens it in a new tab with WebLinkCard, and what the URL guards refuse."
---

Two components show a page from another site. `WebPageView` frames the page
under a bar with its origin. `WebLinkCard` shows the origin and an Open link
that opens the page in a new tab.

```tsx
import { WebLinkCard, WebPageView } from "@smthrs/ui"

<WebPageView url="https://example.com/docs" />
<WebPageView url={url} size="full" actions={<a href={fullScreenHref}>Full screen</a>} />
<WebLinkCard url="https://example.com/docs" onOpen={() => opened.increment()} />
```

## Choose a component

| Use | When |
| --- | --- |
| `WebPageView` | The person reads or uses the page next to the conversation. `inline` is a 28rem frame for a message; `full` fills its container, so give it a flex column or a full-height parent. |
| `WebLinkCard` | The page belongs in its own tab: it signs the person in, refuses framing, or needs the whole window. |

Both components take the URL as a string and check it themselves. Check it
against your own policy first; the components' check is the last guard, not
the policy.

## The frame

```html
<iframe
  src="https://example.com/docs"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
  referrerpolicy="no-referrer"
  loading="lazy"
  title="Web page from example.com">
```

The sandbox string is exported as `WEB_PAGE_SANDBOX`. The frame carries no
`allow` attribute, so the page gets no camera, microphone, location or other
delegated permission. The sandbox has no `allow-top-navigation` token, so the
page cannot navigate your app, and no `allow-downloads` token. The frame sends
no referrer, so the page does not learn which conversation linked it.
Pass-through props go to the `figure`, never the frame, so a caller cannot
replace `src`, `sandbox`, `referrerPolicy` or `loading`.

`allow-same-origin` lets the page keep its own cookies and storage, which most
sites need to work. It is safe only for a page on another site:

- A page that runs scripts on your app's own origin with `allow-same-origin`
  can reach the parent document, remove its own `sandbox` attribute and reload
  unsandboxed.
- A page on your app's site, such as `docs.smithers.sh` under
  `app.smithers.sh`, shares its cookies, and cookies are not isolated by port
  or scheme, so `http://localhost:4000` shares them with an app on
  `http://localhost:1337`.

So `WebPageView` frames only `https:` pages off the host page's site, as
`framedPageTarget` decides. The frame cannot report where a redirect inside it
lands, so a page could redirect the frame to your app. Serve your app's own
pages with `Content-Security-Policy: frame-ancestors 'none'` so that load
fails, and check only the URL you were asked to show.

## The Open in new tab link

`WebPageView` always shows `Open in new tab`, in both sizes. Many sites refuse
framing with `X-Frame-Options` or a `frame-ancestors` policy, and the browser
then shows an empty or error frame that the host page cannot detect. The link
is the way out. Pass your own controls, such as a full-screen link, as
`actions`; they render between the origin and that link.

`WebLinkCard`'s Open is a real anchor with `target="_blank"` and
`rel="noopener noreferrer"`, styled as a `Button`. A person's click on a link
opens the tab, and popup blockers allow it, so the component never calls
`window.open`. `onOpen` runs on that click for your telemetry and never
prevents it.

## The URL guards

Each guard returns `{ href, origin, host }` or `null`. Both strip ASCII tab, CR
and LF and trim the input first, as browsers do, so `java\tscript:` is still
`javascript:`.

`webPageTarget(url, hostOrigin?)` guards `WebLinkCard`'s link. It accepts an
absolute `https:` or `http:` URL and refuses:

- every other scheme: `javascript:`, `data:`, `file:`, `blob:`, `about:`,
  `ftp:`, `mailto:` and the rest;
- relative paths, protocol-relative URLs such as `//example.com`, and
  backslash tricks such as `/\example.com`;
- a URL with a username or password;
- a URL on `hostOrigin`.

`framedPageTarget(url, hostOrigin?)` guards `WebPageView`. It refuses
everything `webPageTarget` refuses, every `http:` URL, and every page on the
site of `hostOrigin`. Without the public suffix list, the site is the hostname
for an IP address or a single label such as `localhost`, and the last two
labels for any other name: `app.smithers.sh` is `smithers.sh`. Under a
two-label public suffix such as `pages.dev` or `co.uk`, that refuses every
neighbor under the suffix too; it fails closed. A `hostOrigin` that is not a
URL refuses every page, except the opaque origin `null`, which shares nothing.

Both components pass `window.location.origin` as `hostOrigin`. On `null`, both
render `EmptyState` with the title `Can't show this page`, with no frame and no
link. The components render
`href`, the parsed URL, never the raw input, and show `origin` as text. An
internationalized host shows as punycode, such as `xn--exmple-4nf.com`, so a
look-alike name cannot pass as another site.

On the server there is no `window`, so the host checks run only in the
browser.

## Related

- [API reference](../api.md#web-pages): the props and exports.
- [Show a generated view](./show-a-generated-view.md): UI an agent writes,
  in a frame without `allow-same-origin`.

---
"@smthrs/views": minor
---

Adds `WebPage`, which asks from a server whether an outside page shows in a frame, before it is framed, and reads
the card shown in its place.

- `WebPage.check(url, { ancestors })` requests the page as a frame would and answers
  `{ framing: "allowed" | "refused" | "unknown", reason?, status?, title?, description?, icon? }`. It never fails.
- `WebPage.framing(headers, { page, ancestors })` decides as a browser does: every enforced `frame-ancestors` must
  admit every ancestor, else `X-Frame-Options`; an `http:` page under an `https:` ancestor is mixed content.
  `WebPage.content(headers)` refuses a PDF, an octet stream and an attachment, which a sandboxed frame never shows.
- `WebPage.preview(html, pageUrl)` reads the title, description and `https:` icon from a page's head, in linear time.
- Every hop is guarded: named hosts only, never an IP literal, `localhost` or a local suffix unless `privateHosts`
  names it; at most five redirects, each guarded; an 8 s deadline for the response and 3 s for the head; at most
  256 KiB of an HTML body; no cookies. Its span carries the framing, reason, status and redirects, never the URL.

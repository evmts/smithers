# Link previews

The app's HTML includes Open Graph metadata and an X large-image card. The site
Worker resolves both image URLs against the request's origin, including custom
hostnames and SPA routes. No deployment hostname is built into the public app.

The card is `public/social-card.png` (1200×630, under 300 KB), containing the
Smithers logo and name. Its source is `public/social-card.svg`. From the repository
root, run `apps/mvp/scripts/render-social-card.sh` with librsvg installed to render
it. Update the embedded icon when `public/icon.svg` changes.

`worker/SocialPreview.workerd.test.ts` requests HTML and the PNG from the real
Worker and assets binding at two HTTPS origins. `worker/index.test.ts` covers
response preservation and HTML transformation. Hosting request logs and traces
remain enabled by the existing Alchemy observability configuration.

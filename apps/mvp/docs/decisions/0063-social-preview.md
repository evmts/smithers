# Origin-aware social previews

The public app shell supplies Open Graph and X metadata. The existing site Worker
serves the asset response and resolves the card URL against the incoming request's
origin. All requests reach that Worker first, including asset hits and SPA fallbacks;
non-HTML responses retain their original body and headers. No deployment hostname
is embedded in the public source. This is core hosting infrastructure, not a plugin
contribution: crawlers must receive metadata before the browser or plugins start.

The library catalog's UI entry is @smthrs/ui. No component or runtime is added:
the static card reuses public/icon.svg and displays only Smithers. Regenerate it
with apps/mvp/scripts/render-social-card.sh (librsvg required). Its editable SVG
and 1200×630 PNG are public assets. Update the SVG's embedded icon when icon.svg
changes.

The real workerd asset-routing regression requests HTML at two independent HTTPS
origins and follows each card URL to the real PNG. The site Worker's existing
routing suite and full app coverage gate also apply. No rendered UI changes.

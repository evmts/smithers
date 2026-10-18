/**
 * The outside-web-page sheet. `inline` gives the frame a fixed height for a
 * chat message; `full` makes the figure a growing column whose frame takes
 * the remaining height of its container.
 *
 * The frame's backdrop is the light `Canvas` system color, not a theme token:
 * an outside page that sets no background was written for a light canvas, and
 * under a dark host it would otherwise show dark text on the host's dark
 * surface. A page that declares a dark `color-scheme` gets the browser's own
 * dark backdrop instead.
 */
import { tokens as t } from "../tokens";

export const webPageCss = `
.sui-web-page-view { margin:0; min-width:0; width:100%; display:flex; flex-direction:column; border:1px solid ${t.border}; border-radius:${t.radius}; background:${t.card}; color:${t.cardForeground}; overflow:hidden; }
.sui-web-page-view[data-size='full'] { flex:1 1 auto; height:100%; min-height:0; }
.sui-web-page-bar { flex:none; display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:6px 8px 6px 14px; border-bottom:1px solid ${t.border}; }
.sui-web-page-origin { min-width:0; flex:1; color:${t.mutedForeground}; font-family:${t.fontMono}; font-size:${t.fontSizeCompact}; overflow-wrap:anywhere; }
.sui-web-page-actions { flex:none; display:flex; align-items:center; gap:4px; }
.sui-web-page-frame { display:block; width:100%; border:0; color-scheme:light; background:Canvas; }
.sui-web-page-view[data-size='inline'] .sui-web-page-frame { height:28rem; }
.sui-web-page-view[data-size='full'] .sui-web-page-frame { flex:1 1 auto; min-height:0; }
.sui-web-link-card { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:10px 14px; }
.sui-web-link-origin { min-width:0; flex:1; color:${t.foreground}; font-family:${t.fontMono}; font-size:${t.fontSizeCompact}; overflow-wrap:anywhere; }
`;

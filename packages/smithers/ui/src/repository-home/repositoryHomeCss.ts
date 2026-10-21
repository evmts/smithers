/** A repository home's sheet: a column of blocks, a quiet heading per block, and app buttons in one wrapping row. */
import { tokens as t } from "../tokens";

export const repositoryHomeCss = `
.sui-repository-home { min-width:0; display:flex; flex-direction:column; gap:20px; color:${t.foreground}; }
.sui-repository-home-block { min-width:0; display:flex; flex-direction:column; align-items:flex-start; gap:8px; }
.sui-repository-home-title { margin:0; color:${t.foreground}; font-size:13px; font-weight:650; }
.sui-repository-home-text { align-self:stretch; margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
.sui-repository-home-links { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:4px; }
.sui-repository-home-link { color:${t.primary}; text-decoration:underline; text-underline-offset:2px; overflow-wrap:anywhere; }
.sui-repository-home-link:hover { text-decoration-thickness:2px; }
.sui-repository-home-link:focus-visible { outline:none; box-shadow:0 0 0 3px ${t.ring}; border-radius:${t.radiusControl}; }
.sui-repository-home-block > .sui-md { align-self:stretch; min-width:0; }
.sui-repository-home-notice { margin:0; color:${t.mutedForeground}; font-size:${t.fontSizeCompact}; overflow-wrap:anywhere; }
.sui-repository-home-apps { min-width:0; display:flex; flex-wrap:wrap; gap:8px; }
`;

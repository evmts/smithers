/**
 * Sheets for browsing a repository: the path trail (`Breadcrumbs`), one
 * directory's rows (`DirectoryListing`) and the repository view that composes
 * them with the file tree, the code view and the Markdown editor
 * (`adapters/repo-view`). Composed into `smithersUiCss` like every other sheet.
 *
 * The repository view sizes itself from its own width, not the window's
 * (`container-type: inline-size`), so the same view lays out right as a page
 * and inside a conversation: below 720px it drops the tree and stacks.
 */
import { tokens as t } from "./tokens";

const focusRing = `outline:none; border-color:${t.ringBorder}; box-shadow:0 0 0 3px ${t.ring};`;
const interaction = "transition:background-color .12s ease, border-color .12s ease, color .12s ease;";

export const breadcrumbsCss = `
.sui-breadcrumbs { min-width:0; font-size:13px; }
.sui-breadcrumbs-list { display:flex; flex-wrap:wrap; align-items:center; gap:4px; margin:0; padding:0; list-style:none; }
.sui-breadcrumbs-item { display:inline-flex; align-items:center; gap:4px; min-width:0; }
.sui-breadcrumbs-separator { color:${t.mutedForeground}; }
.sui-breadcrumbs-link { color:${t.primary}; text-decoration:none; border-radius:${t.radiusControl}; overflow-wrap:anywhere; }
.sui-breadcrumbs-link:hover { text-decoration:underline; }
.sui-breadcrumbs-link:focus-visible { ${focusRing} }
.sui-breadcrumbs-current { color:${t.foreground}; font-weight:650; overflow-wrap:anywhere; }
`;

export const directoryListingCss = `
.sui-dir { min-width:0; }
.sui-dir-list { margin:0; padding:0; list-style:none; }
.sui-dir-row { min-width:0; border-bottom:1px solid ${t.border}; }
.sui-dir-row:last-child { border-bottom:none; }
.sui-dir-link { min-width:0; display:flex; align-items:center; gap:10px; padding:8px 14px; color:${t.foreground}; font-size:13px; text-decoration:none; ${interaction} }
.sui-dir-link:hover { background:${t.hoverSubtle}; }
.sui-dir-link:hover .sui-dir-name { color:${t.primary}; text-decoration:underline; }
.sui-dir-link:focus-visible { ${focusRing} }
.sui-dir-icon { flex:none; width:16px; height:16px; color:${t.mutedForeground}; }
.sui-dir-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sui-dir-empty { padding:14px; color:${t.mutedForeground}; font-size:13px; }
`;

export const repoViewCss = `
.sui-repo { container-type:inline-size; min-width:0; color:${t.foreground}; }
.sui-repo-layout { min-width:0; display:grid; grid-template-columns:minmax(0, 1fr); gap:16px; }
.sui-repo[data-size='full'] > .sui-repo-layout { grid-template-columns:240px minmax(0, 1fr); align-items:start; }
.sui-repo-side { position:sticky; top:0; min-width:0; max-height:100vh; display:grid; gap:4px; padding-right:12px; border-right:1px solid ${t.border}; overflow:auto; }
.sui-repo-main { min-width:0; display:grid; align-content:start; gap:12px; }
.sui-repo-head { min-width:0; display:flex; flex-wrap:wrap; align-items:center; gap:10px; }
.sui-repo-revision { flex:none; display:inline-flex; align-items:center; }
.sui-repo-trail { flex:1 1 auto; }
.sui-repo-actions { flex:none; display:flex; align-items:center; gap:8px; margin-left:auto; }
.sui-repo-summary { min-width:0; }
.sui-repo-content { min-width:0; display:grid; align-content:start; gap:16px; }
.sui-repo[data-size='inline'] .sui-repo-content { max-height:420px; overflow:auto; }
.sui-repo-box { min-width:0; border:1px solid ${t.border}; border-radius:${t.radius}; background:${t.card}; overflow:hidden; }
.sui-repo-toolbar { min-width:0; display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:8px 14px; border-bottom:1px solid ${t.border}; color:${t.mutedForeground}; font-size:${t.fontSizeCompact}; }
.sui-repo-readme-name { color:${t.foreground}; font-weight:650; text-decoration:none; border-radius:${t.radiusControl}; }
.sui-repo-readme-name:hover { text-decoration:underline; }
.sui-repo-readme-name:focus-visible { ${focusRing} }
.sui-repo-stats { min-width:0; font-variant-numeric:tabular-nums; }
.sui-repo-file-actions { display:flex; align-items:center; gap:8px; margin-left:auto; }
.sui-repo-segmented { display:inline-flex; padding:2px; gap:2px; border:1px solid ${t.border}; border-radius:${t.radiusControl}; background:${t.secondary}; }
.sui-repo-segment { padding:2px 10px; border:none; border-radius:4px; background:transparent; color:${t.mutedForeground}; font:inherit; font-size:${t.fontSizeCompact}; cursor:pointer; ${interaction} }
.sui-repo-segment:hover { color:${t.foreground}; }
.sui-repo-segment:focus-visible { ${focusRing} }
.sui-repo-segment[aria-pressed='true'] { background:${t.card}; color:${t.foreground}; font-weight:650; }
.sui-repo-note { padding:14px; color:${t.mutedForeground}; font-size:13px; }
.sui-repo-code { border-radius:0; }
@container (max-width: 719px) {
  .sui-repo[data-size='full'] > .sui-repo-layout { grid-template-columns:minmax(0, 1fr); }
  .sui-repo-side { display:none; }
}
`;

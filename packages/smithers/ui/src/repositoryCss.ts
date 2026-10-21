/**
 * Sheets for browsing a repository: the path trail (`Breadcrumbs`), one
 * directory's rows (`DirectoryListing`), the branch and tag picker
 * (`RefPicker`) and a panel anchored to its trigger (`Popover`). Composed into
 * `smithersUiCss` like every other sheet. `RepoView`, which composes them with
 * the file tree, the code view and the Markdown editor, ships its own sheet in
 * `@smthrs/repo-view`.
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

export const popoverCss = `
.sui-popover-content { z-index:50; min-width:220px; max-width:calc(100vw - 32px); padding:8px; border:1px solid ${t.border}; border-radius:${t.radius}; background:${t.popover}; color:${t.popoverForeground}; box-shadow:${t.shadow3}; outline:none; }
`;

export const refPickerCss = `
.sui-ref-picker { display:inline-flex; min-width:0; }
.sui-ref-picker-trigger { max-width:240px; }
.sui-ref-picker-icon { flex:none; width:14px; height:14px; }
.sui-ref-picker-current { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:${t.fontMono}; font-size:${t.fontSizeCompact}; }
.sui-ref-picker-panel { width:300px; display:grid; gap:8px; }
.sui-ref-picker-filter { width:100%; }
.sui-ref-picker-list { max-height:280px; margin:0; padding:0; list-style:none; overflow-y:auto; }
.sui-ref-picker-item { min-width:0; display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:${t.radiusControl}; color:${t.foreground}; font-size:13px; text-decoration:none; ${interaction} }
.sui-ref-picker-item:hover { background:${t.hoverSubtle}; }
.sui-ref-picker-item:focus-visible { ${focusRing} }
.sui-ref-picker-item[aria-current='true'] { font-weight:650; }
.sui-ref-picker-name { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sui-ref-picker-sha { flex:none; color:${t.mutedForeground}; font-family:${t.fontMono}; font-size:${t.fontSizeCompact}; }
.sui-ref-picker-note { padding:8px; color:${t.mutedForeground}; font-size:13px; }
`;

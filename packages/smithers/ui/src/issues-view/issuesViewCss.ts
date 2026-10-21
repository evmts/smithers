/**
 * The `issues` template's sheet. `inline` bounds the list's height and lets it
 * scroll; `full` lets it grow with the page. A linked title takes the brand on
 * hover and the house ring on focus; a pending or triage chip is a compact badge.
 */
import { tokens as t } from "../tokens";

export const issuesViewCss = `
.sui-issues-view { min-width:0; display:grid; border:1px solid ${t.border}; border-radius:${t.radius}; background:${t.card}; color:${t.cardForeground}; }
.sui-issues-header { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 14px; border-bottom:1px solid ${t.border}; font-size:13px; }
.sui-issues-repo { min-width:0; margin-right:auto; font-weight:650; overflow-wrap:anywhere; }
.sui-issues-counts { flex:none; color:${t.mutedForeground}; font-size:${t.fontSizeCompact}; }
.sui-issues-loading-status { color:${t.mutedForeground}; }
.sui-issues-actions { flex:none; display:flex; align-items:center; gap:6px; }
.sui-issues-loading { display:grid; gap:10px; padding:12px 14px; }
.sui-issues-skeleton { height:18px; }
.sui-issues-list { margin:0; padding:0; list-style:none; }
.sui-issues-view[data-size='inline'] .sui-issues-list { max-height:320px; overflow-y:auto; }
.sui-issues-list:focus-visible { outline:none; box-shadow:inset 0 0 0 2px ${t.ringBorder}; }
.sui-issues-row { min-width:0; display:flex; align-items:flex-start; gap:10px; padding:10px 14px; border-bottom:1px solid ${t.border}; }
.sui-issues-row:last-child { border-bottom:none; }
.sui-issues-state { flex:none; }
.sui-issues-main { min-width:0; flex:1; display:grid; gap:4px; }
.sui-issues-title-line { min-width:0; display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
.sui-issues-title { min-width:0; color:${t.foreground}; font-size:13px; font-weight:650; overflow-wrap:anywhere; }
.sui-issues-link { text-decoration:none; border-radius:${t.radiusControl}; }
.sui-issues-link:hover { color:${t.primary}; text-decoration:underline; text-underline-offset:3px; }
.sui-issues-link:focus-visible { outline:none; box-shadow:0 0 0 3px ${t.ring}; }
.sui-issues-pending, .sui-issues-triage { min-height:18px; padding:0 6px; font-size:11px; }
.sui-issues-meta { display:flex; flex-wrap:wrap; align-items:center; gap:8px; color:${t.mutedForeground}; font-size:${t.fontSizeCompact}; }
.sui-issues-comments { flex:none; color:${t.mutedForeground}; font-size:${t.fontSizeCompact}; }
`;

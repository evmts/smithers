/**
 * The stack's sheet: `StackList`'s rows, `TodoCard` and `TodoDraftCard`. Chips
 * are the compact badge the issue list uses. A selected row takes the brand
 * wash, a focused row or link the house ring, and a merged or dropped row's
 * title is muted. A draft's dashed border marks it as not on the stack yet.
 */
import { tokens as t } from "../tokens";

export const stackCss = `
.sui-stack-list { min-width:0; display:grid; border:1px solid ${t.border}; border-radius:${t.radius}; background:${t.card}; color:${t.cardForeground}; }
.sui-stack-header { min-width:0; display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid ${t.border}; }
.sui-stack-heading { min-width:0; margin:0 auto 0 0; font-size:13px; font-weight:650; }
.sui-stack-loading-status { color:${t.mutedForeground}; }
.sui-stack-actions { flex:none; display:flex; align-items:center; gap:6px; }
.sui-stack-loading { display:grid; gap:10px; padding:12px 14px; }
.sui-stack-skeleton { height:18px; }
.sui-stack-rows { margin:0; padding:0; list-style:none; }
.sui-stack-row { min-width:0; display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; min-height:44px; padding:6px 14px; border-bottom:1px solid ${t.border}; font-size:13px; }
.sui-stack-row:last-child { border-bottom:none; }
.sui-stack-row[aria-current='true'] { background:${t.primarySoft}; box-shadow:inset 2px 0 0 ${t.primary}; }
.sui-stack-row:focus-visible { outline:none; box-shadow:inset 0 0 0 2px ${t.ringBorder}; }
.sui-stack-main { min-width:0; flex:1 1 160px; }
.sui-stack-title { color:${t.foreground}; font-weight:500; overflow-wrap:anywhere; }
.sui-stack-link { text-decoration:none; border-radius:${t.radiusControl}; }
.sui-stack-link:hover { color:${t.primary}; text-decoration:underline; text-underline-offset:3px; }
.sui-stack-link:focus-visible { outline:none; box-shadow:0 0 0 3px ${t.ring}; }
.sui-stack-row[data-state='merged'] .sui-stack-title, .sui-stack-row[data-state='dropped'] .sui-stack-title, .sui-stack-row[data-state='merged'] .sui-todo-number, .sui-stack-row[data-state='dropped'] .sui-todo-number { color:${t.mutedForeground}; }
.sui-todo-number { flex:none; min-width:28px; color:${t.mutedForeground}; font-family:${t.fontMono}; font-size:${t.fontSizeCompact}; font-variant-numeric:tabular-nums; }
.sui-todo-state, .sui-todo-pending, .sui-todo-draft-private, .sui-todo-draft-refused { flex:none; min-height:18px; padding:0 6px; font-size:11px; }
.sui-todo-drop { flex:none; }
.sui-todo-drop-confirm { flex:none; display:inline-flex; align-items:center; gap:6px; }
.sui-todo-card, .sui-todo-draft { min-width:0; display:grid; gap:12px; padding:14px 16px; border:1px solid ${t.border}; border-radius:${t.radius}; background:${t.card}; color:${t.cardForeground}; }
.sui-todo-card-header, .sui-todo-draft-header { min-width:0; display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.sui-todo-card-title { min-width:0; margin:0; font-size:15px; font-weight:650; overflow-wrap:anywhere; border-radius:${t.radiusControl}; }
.sui-todo-card-title:focus { outline:none; }
.sui-todo-card-title:focus-visible { box-shadow:0 0 0 3px ${t.ring}; }
.sui-todo-card-prompt { min-width:0; }
.sui-todo-card-footer { display:flex; justify-content:flex-end; gap:6px; }
.sui-todo-acceptance { display:grid; gap:4px; }
.sui-todo-acceptance-label { color:${t.mutedForeground}; font-size:${t.fontSizeCompact}; font-weight:650; }
.sui-todo-acceptance-list { margin:0; padding:0 0 0 18px; display:grid; gap:2px; font-size:13px; }
.sui-todo-draft { border-style:dashed; }
.sui-todo-draft-name { font-size:13px; font-weight:650; }
.sui-todo-draft-repo { min-width:0; margin-left:auto; color:${t.mutedForeground}; font-size:${t.fontSizeCompact}; overflow-wrap:anywhere; }
.sui-todo-draft-actions { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:8px; }
.sui-todo-draft-refused { margin-right:auto; }
`;

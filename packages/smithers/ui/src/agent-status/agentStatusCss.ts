/**
 * The agent-status sheet: the pill's glyph, pulse and count; the needs-you
 * card in gold; the toast stack at the bottom-left, full width on a phone.
 * Gold is `--warning` and ember is `--danger` (mvp.md §6.4: "Needs you is gold
 * and failures are ember").
 */
import { tokens as t } from "../tokens";

export const agentStatusCss = `
button.sui-agent-status { cursor:pointer; font:inherit; font-size:12px; font-weight:650; }
button.sui-agent-status:focus-visible { outline:none; box-shadow:0 0 0 3px ${t.ring}; }
.sui-agent-status-glyph { flex:none; font-size:11px; line-height:1; }
.sui-agent-status[data-state='working'] .sui-agent-status-glyph { animation:sui-agent-status-pulse 1.6s ease-in-out infinite; }
@keyframes sui-agent-status-pulse { 0%, 100% { opacity:1; } 50% { opacity:.35; } }
.sui-agent-status-count { min-width:18px; padding:0 6px; border-radius:${t.radiusFull}; background:${t.warning}; color:${t.card}; font-size:11px; font-variant-numeric:tabular-nums; text-align:center; }
.sui-needs-you { display:flex; flex-direction:column; gap:8px; min-width:0; max-width:100%; padding:10px 12px; border:1px solid ${t.warningBorder}; border-radius:${t.radius}; background:${t.warningSoft}; color:${t.foreground}; }
.sui-needs-you-prompt { margin:0; font-size:15px; overflow-wrap:anywhere; }
.sui-needs-you-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin:0; }
.sui-needs-you-field { flex:1 1 180px; font-size:16px; }
.sui-needs-you-answered { display:flex; flex-direction:column; gap:2px; min-width:0; padding:0 2px; color:${t.mutedForeground}; font-size:13px; }
.sui-needs-you-answered-label { font-size:12px; font-weight:650; }
.sui-needs-you-answer { color:${t.foreground}; overflow-wrap:anywhere; }
.sui-toast-stack { position:fixed; z-index:40; left:16px; bottom:16px; display:flex; flex-direction:column; align-items:flex-start; gap:6px; width:min(380px, calc(100vw - 32px)); }
.sui-toast { display:flex; align-items:center; gap:8px; width:100%; min-width:0; padding:6px 6px 6px 12px; border:1px solid ${t.borderStrong}; border-left:3px solid ${t.mutedForeground}; border-radius:${t.radius}; background:${t.card}; color:${t.foreground}; box-shadow:${t.shadow3}; font-size:13px; }
.sui-toast[data-delayed] { animation:sui-toast-in .12s ease .3s both; }
@keyframes sui-toast-in { from { opacity:0; } to { opacity:1; } }
.sui-toast[data-tone='needs_you'] { border-left-color:${t.warning}; }
.sui-toast[data-tone='failed'] { border-left-color:${t.destructive}; }
.sui-toast[data-tone='working'] { border-left-color:${t.primary}; }
.sui-toast-glyph { flex:none; font-size:12px; }
.sui-toast[data-tone='needs_you'] .sui-toast-glyph { color:${t.warning}; }
.sui-toast[data-tone='failed'] .sui-toast-glyph { color:${t.destructive}; }
.sui-toast[data-tone='working'] .sui-toast-glyph { color:${t.primary}; }
.sui-toast-text { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sui-toast-text b { font-weight:650; }
.sui-toast-hide { flex:none; color:${t.mutedForeground}; }
@media (max-width: 640px) { .sui-toast-stack[data-placement='fixed'] { left:16px; right:16px; bottom:64px; width:auto; } }
.sui-toast-stack[data-placement='inline'] { position:static; width:100%; }
`;

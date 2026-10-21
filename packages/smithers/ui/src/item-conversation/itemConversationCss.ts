/**
 * The issue page's sheet: `ItemConversation` (header, body, comments, composer)
 * and `IssueForm`. Posts are cards on the house border; a requested comment's
 * border is dashed and a not-sent one's is danger, so a pending write reads
 * at a glance in both themes.
 */
import { tokens as t } from "../tokens";

export const itemConversationCss = `
.sui-item-conv { min-width:0; display:grid; align-content:start; gap:14px; color:${t.foreground}; }
.sui-item-conv-header { min-width:0; display:grid; gap:8px; padding-bottom:12px; border-bottom:1px solid ${t.border}; }
.sui-item-conv-title { margin:0; min-width:0; color:${t.foreground}; font-size:20px; font-weight:650; line-height:1.3; overflow-wrap:anywhere; }
.sui-item-conv-number { color:${t.mutedForeground}; font-weight:400; }
.sui-item-conv-meta, .sui-item-conv-comment-meta { min-width:0; display:flex; flex-wrap:wrap; align-items:center; gap:8px; color:${t.mutedForeground}; font-size:${t.fontSizeCompact}; }
.sui-item-conv-state { flex:none; }
.sui-item-conv-pending { min-height:18px; padding:0 6px; font-size:11px; }
.sui-item-conv-author { color:${t.foreground}; font-weight:650; overflow-wrap:anywhere; }
.sui-item-conv-reason { color:${t.destructive}; }
.sui-item-conv-external { margin-left:auto; color:${t.primary}; text-decoration:none; border-radius:${t.radiusControl}; }
.sui-item-conv-external:hover { text-decoration:underline; text-underline-offset:3px; }
.sui-item-conv-external:focus-visible { outline:none; box-shadow:0 0 0 3px ${t.ring}; }
.sui-item-conv-header-actions { margin-left:auto; display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
.sui-item-conv-external + .sui-item-conv-header-actions { margin-left:0; }
.sui-item-conv-post, .sui-item-conv-comment { min-width:0; display:grid; gap:8px; padding:12px 14px; border:1px solid ${t.border}; border-radius:${t.radius}; background:${t.card}; color:${t.cardForeground}; }
.sui-item-conv-comments { margin:0; padding:0; list-style:none; display:grid; gap:10px; }
.sui-item-conv-comment[data-pending='requested'] { border-style:dashed; border-color:${t.borderStrong}; }
.sui-item-conv-comment[data-pending='not_sent'] { border-color:${t.destructiveBorder}; }
.sui-item-conv-comment-actions { display:flex; flex-wrap:wrap; gap:6px; }
.sui-item-conv-composer { min-width:0; display:grid; gap:8px; }
.sui-item-conv-composer-actions, .sui-issue-form-actions { display:flex; justify-content:flex-end; gap:6px; }
.sui-item-conv-loading-status { color:${t.mutedForeground}; }
.sui-item-conv-loading { display:grid; gap:10px; }
.sui-item-conv-skeleton-title { width:min(100%, 420px); height:24px; }
.sui-item-conv-skeleton-body { height:64px; }
.sui-issue-form { min-width:0; display:grid; gap:14px; }
.sui-issue-form-error { margin:0; color:${t.destructive}; font-size:${t.fontSizeCompact}; }
`;

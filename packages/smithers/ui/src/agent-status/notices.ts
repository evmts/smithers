/**
 * Notices (apps/mvp decision 0009 §4): what a toast or a feed entry is about,
 * and when its toast shows. The agent's five states plus `update`, and pure
 * visibility, so a component keeps no timers and a reload draws the same
 * stack. Framework-free.
 */
import { AGENT_STATUS_GLYPHS, AGENT_STATUS_WORDS, type AgentState } from "./agentStatus";

/** What a notice is about: one of the agent's five states, or `update`, an event such as a repository's main moving or a new release. */
export type NoticeState = AgentState | "update";

/** The glyph each notice state shows: the agent's glyphs plus `●` for an update. */
export const NOTICE_GLYPHS: Readonly<Record<NoticeState, string>> = Object.freeze({
  ...AGENT_STATUS_GLYPHS,
  update: "●",
});

/** The one word each notice state shows: the agent's words plus `Updated`. */
export const NOTICE_WORDS: Readonly<Record<NoticeState, string>> = Object.freeze({
  ...AGENT_STATUS_WORDS,
  update: "Updated",
});

const SETTLED_TOAST_MS = 4000;

/** Milliseconds a notice's toast shows before it hides on its own: 4000 for "done" and "update"; Infinity for the rest (they show while live, until answered, or until dismissed). */
export const noticeDismissDelay = (state: NoticeState): number =>
  state === "done" || state === "update" ? SETTLED_TOAST_MS : Number.POSITIVE_INFINITY;

/** Whether a notice's toast shows at nowMs (0009 §4): open, not hidden, and nowMs < updatedAtMs + noticeDismissDelay(state). Pure. */
export const workNoticeVisible = (
  notice: {
    readonly state: NoticeState;
    readonly updatedAtMs: number;
    readonly open: boolean;
    readonly hidden: boolean;
  },
  nowMs: number,
): boolean => notice.open && !notice.hidden && nowMs < notice.updatedAtMs + noticeDismissDelay(notice.state);

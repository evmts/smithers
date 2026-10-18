/**
 * The print channel: how a REPL frame's `console.log` calls become the bytes
 * its successor reads.
 *
 * Two jobs live here, and both were priced off the `rerun-r95repl` lane rather
 * than chosen.
 *
 * Every number here is a count of UTF-8 bytes, which is what the frame bound
 * and the retention ceiling both mean by "bytes": the notices this module writes
 * carry a `…`, three bytes wide and one UTF-16 unit, and counting them in units
 * put a frame one byte over its own ceiling.
 *
 * **Sharing the frame budget.** Statements used to cap independently at 4 KiB
 * each, head-first, under a 16 KiB frame bound that almost nobody reached: 197
 * of the lane's 357 printing frames had a statement cut, 191 of those while the
 * frame bound sat mostly unspent, and 3.06 MB went to per-statement caps against
 * 6 frames that ever reached the frame one. Head-first is the part that cost
 * verdicts — `sympy__sympy-13878` fused one `console.log` of 38,928 bytes whose
 * head was a Python deprecation banner, so what it lost was the tail: the result
 * of a three-minute test suite the same frame had just paid for, and the `git
 * diff` that would have shown it the edit was already in the tree. It re-ran
 * that suite four frames later. So the statements of a frame share one budget,
 * each is elided from the middle, and no ceiling moves: 16 KiB was the most a
 * frame could deliver before and it is the most now.
 *
 * **Compacting a printed structure.** A result printed whole is mostly repeated
 * keys — a grep hit names `file`, `line`, `text` once per match — so an array of
 * matches renders as file groups with numbered hits and context; other records
 * render as a table with the union of keys named once. It is keyed on the shape
 * and nothing else — this module knows no flow. Repeated keys save bytes;
 * sparse records with mostly distinct keys can cost more as a table.
 *
 * @since 0.1.0
 * @private
 * @slop
 */
import type { Schema } from "effect";
/**
 * How many UTF-8 bytes of one frame's whole print buffer reach the next model turn.
 *
 * This is the only ceiling on the channel. A frame's statements *share* it:
 * each is middle-elided to the share it is apportioned, and a statement short
 * of its share hands the remainder back to the statements that are over theirs.
 *
 * They used to cap independently at 4 KiB each, head-first, and the r95repl
 * lane priced that: 197 of its 357 printing frames had a statement cut, 191 of
 * them while this frame budget sat mostly unspent, and 3.06 MB went to
 * per-statement caps against 6 frames that ever reached this one. The
 * `sympy__sympy-13878` run fused one `console.log` of 38,928 bytes; it was
 * shown the first 4,096 and lost the tail, which held the result of a
 * three-minute test suite the frame had already paid for. It ran that suite
 * again four frames later. Sharing the budget shows that frame 16 KiB from both
 * ends instead of 4 KiB from the head, and moves no ceiling: 16 KiB was the
 * most a frame could ever deliver before, and it is the most now.
 *
 * Every elision is from the middle with the dropped byte count stated, because
 * the head and the tail of a log are where it identifies itself, and the notices
 * are reserved out of this budget before any of it is apportioned — so the
 * assembled buffer is bounded outright and nothing has to shorten it a second
 * time. Sized against the `recall` budget it replaces, and delivered once rather
 * than re-rendered every frame.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const printFrameBytes: number;
/**
 * The smallest UTF-8-byte share of {@link printFrameBytes} one print statement is given.
 *
 * A share below this is all notice and no value — a middle elision of 80 bytes
 * says less than the sentence explaining it — so a frame that printed more
 * statements than the budget can floor drops whole statements from the middle
 * and states how many, rather than cutting every one of them to nothing. That
 * is the same shape the frame bound already had, applied a statement at a time
 * so nothing is cut mid-line.
 *
 * It bounds how many statements are *kept*, but it is not a division of the
 * budget: how many a frame can carry is priced off the statements it actually
 * printed, so a statement at or under this size is shown whole and costs only
 * itself. Two hundred eight-byte lines cost eighteen hundred bytes and all two
 * hundred survive; sixty statements of four times this size do not, and whole
 * ones go from the middle rather than every one of them being cut to a notice.
 *
 * @category constants
 * @since 0.1.0
 * @slop
 */
export declare const printStatementFloor = 512;
/**
 * How many UTF-8 bytes of one frame's print buffer the host keeps while the cell still runs.
 *
 * {@link printFrameBytes} bounds what the model is shown; this bounds what the
 * host holds to show it from, and the two are different numbers because they
 * answer different questions. A cell printing in a loop hands the host one
 * payload per statement, and every payload is copied out of the sandbox's heap
 * and decoded before anything can judge it surplus, so the frame budget alone
 * bounds the answer while leaving the work unbounded. Sixteen times the frame
 * budget is far past any honest use and still a fixed ceiling: past it the
 * payload is not read at all, and the count of what went unread is stated in the
 * buffer rather than dropped in silence.
 *
 * A statement is held at no more than {@link printFrameBytes} — the two ends of
 * it, with the size it had — because a whole frame's budget is the most any one
 * statement could ever be shown. So this ceiling holds at least sixteen
 * statements whatever a cell prints, and a cell that prints many small values
 * reaches it only after hundreds of them.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const printRetainedBytes: number;
/**
 * The fewest records an array needs before it is rendered as a table.
 *
 * Two rows do not repay a header line, and one row is not a table at all.
 *
 * @since 0.1.0
 * @private
 * @slop
 */
export declare const tableRows = 3;
/**
 * What the model is told when a print was cut: the value is still bound.
 *
 * @since 0.1.0
 * @private
 * @slop
 */
export declare const recall = "print a narrower slice of this value; it is still bound in the realm";
/**
 * One `console.log` call, as the host kept it.
 *
 * @since 0.1.0
 * @private
 * @slop
 */
export interface Statement {
    /** The head and tail the host kept, in order and possibly the whole thing. */
    readonly text: string;
    /** What the statement rendered to before anything was dropped. */
    readonly bytes: number;
}
/**
 * Renders an array of records as a table, or nothing.
 *
 * Columns are the union of keys in first-seen order, and a column name is
 * quoted by the same rule as a cell. An absent member is an empty cell;
 * explicit null, empty arrays and empty objects stay `null`, `[]` and `{}`.
 * Cells are the string itself where that is unambiguous — no newline, carriage
 * return or column separator — and canonical JSON everywhere else. An empty
 * string still looks absent, and a string spelling a JSON literal still looks
 * like that value: this is a log rather than a wire format, so it is not paid
 * for in quoting every cell.
 *
 * @since 0.1.0
 * @private
 * @slop
 */
export declare const table: (value: Schema.Json) => string | undefined;
/**
 * Renders one printed JSON value compactly.
 *
 * A match list becomes numbered source lines; other records become a table.
 * An object with exactly one such member becomes that object's other members
 * as JSON, then the member's name, count and rendered list. An exact failed-call
 * envelope becomes its code, message and optional hint. Everything else is
 * canonical JSON as before.
 *
 * Tables save repeated keys but pay for every column boundary, including
 * absent members. The three-row, two-column floor saves bytes for uniform
 * records; it does not guarantee savings for sparse records. Rendering stays
 * shape-based rather than comparing both encodings.
 *
 * @since 0.1.0
 * @private
 * @slop
 */
export declare const render: (value: Schema.Json) => string;
/**
 * Apportions one budget across statements of the given sizes.
 *
 * Short statements take what they need and hand the remainder back, so a frame
 * that printed one long value and three short ones spends the budget on the long
 * one. Allocation runs shortest first, which is what makes the hand-back
 * possible, and the result is in the order the sizes were given.
 *
 * @since 0.1.0
 * @private
 * @slop
 */
export declare const shares: (sizes: ReadonlyArray<number>, budget: number) => ReadonlyArray<number>;
/**
 * How many of *these* statements a budget can keep at the floor, head first.
 *
 * A count of the statements in hand rather than a constant, because what a
 * statement costs is what it is. Taken as `printFrameBytes / printStatementFloor`
 * it was 32 whatever a frame printed, so a frame of two hundred eight-byte lines
 * dropped a hundred and sixty-eight of them while fifteen of its sixteen
 * kilobytes went unspent — the failure the shared budget exists to end,
 * reintroduced one level up. Two hundred lines that cost nine bytes each cost
 * eighteen hundred, and the budget keeps every one of them.
 *
 * The walk takes the head, then the tail, then the head again, which is the
 * order {@link buffer} assembles them in, so a budget that affords an odd number
 * spends the odd one on the earlier statement.
 *
 * @since 0.1.0
 * @private
 * @slop
 */
export declare const capacity: (statements: ReadonlyArray<Statement>, budget: number) => number;
/**
 * Assembles what a frame printed, bounded by {@link printFrameBytes}.
 *
 * `unread` is the count of statements the host stopped copying out of the realm
 * because the frame had already handed over more than it holds. It is stated
 * rather than dropped, because a buffer that simply stopped reads as a cell that
 * simply stopped printing.
 *
 * The bound holds by construction rather than by a second pass over the result,
 * because a second pass would cut a notice in half and that is the one thing a
 * bound may not do. {@link capacity} charges every kept statement the floor it is
 * promised, the notice it would print and its newline; what survives that walk is
 * therefore affordable, and the apportionment below spends only what the walk
 * left. A statement at or under the floor is shown whole and reserves no notice
 * at all — reserving one apiece is what left a frame of short lines nothing to
 * spend on the lines themselves.
 *
 * @since 0.1.0
 * @private
 * @slop
 */
export declare const buffer: (statements: ReadonlyArray<Statement>, unread: number) => string;

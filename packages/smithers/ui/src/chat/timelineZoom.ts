/** Height-bounded octaves, with room for every wrapped label and the gaps between rows. */
export const TIMELINE_ROW_GAP = 2;
const measuredHeight = (height: number) => Math.max(0, Number.isFinite(height) ? height : 0);
const measuredRow = (height: number) => Math.max(1, Number.isFinite(height) ? height : 32);
export const timelineCapacity = (height: number, rowHeight = 32): number =>
  Math.max(2, Math.floor((measuredHeight(height) + TIMELINE_ROW_GAP) / (measuredRow(rowHeight) + TIMELINE_ROW_GAP)));
export const timelineLevelCount = (count: number, height: number, rowHeight = 32): number => {
  if (count <= 0) return 0;
  const capacity = timelineCapacity(height, rowHeight);
  let levels = 1;
  while (count > capacity * 8 ** (levels - 1)) levels++;
  return levels;
};
export interface TimelineBlock { readonly id: string; readonly start: number; readonly end: number }
export interface TimelineLevel {
  readonly level: number;
  readonly start: number;
  readonly end: number;
  readonly blocks: readonly TimelineBlock[];
  readonly band: { readonly top: number; readonly height: number };
}
/** Half-open entry ranges and bands matching the rows' minimum height plus proportional free space. */
export const timelineLevels = (ids: readonly string[], height: number, first: number, last: number, rowHeight = 32): readonly TimelineLevel[] => {
  height = measuredHeight(height);
  rowHeight = measuredRow(rowHeight);
  const count = ids.length, capacity = timelineCapacity(height, rowHeight), levels: TimelineLevel[] = [];
  let innerStart = Math.max(0, Math.min(count - 1, first));
  let innerEnd = Math.max(innerStart + 1, Math.min(count, last + 1));
  const center = (innerStart + innerEnd - 1) / 2;
  for (let level = 0; level < timelineLevelCount(count, height, rowHeight); level++) {
    const stride = 8 ** level, total = Math.ceil(count / stride);
    const startBlock = Math.max(0, Math.min(total - capacity, Math.floor(center / stride) - Math.floor(capacity / 2)));
    const endBlock = Math.min(total, startBlock + capacity);
    const start = startBlock * stride, end = Math.min(count, endBlock * stride);
    const blocks = Array.from({ length: endBlock - startBlock }, (_, offset) => {
      const a = (startBlock + offset) * stride, b = Math.min(count, a + stride);
      return { id: JSON.stringify([level, ...ids.slice(a, b)]), start: a, end: b };
    });
    const available = Math.max(height, blocks.length * rowHeight + (blocks.length - 1) * TIMELINE_ROW_GAP);
    const free = available - blocks.length * rowHeight - (blocks.length - 1) * TIMELINE_ROW_GAP;
    const edge = (entry: number, trailing: boolean): number => {
      const offset = entry - start;
      const index = Math.max(0, Math.min(blocks.length - 1, Math.floor(offset / stride) - (trailing && offset % stride === 0 ? 1 : 0)));
      const block = blocks[index]!;
      const size = block.end - block.start;
      const before = index * (rowHeight + TIMELINE_ROW_GAP) + free * (block.start - start) / (end - start);
      return before + (rowHeight + free * size / (end - start)) * (entry - block.start) / size;
    };
    const top = edge(Math.max(start, innerStart), false);
    const bottom = edge(Math.min(end, innerEnd), true);
    levels.push({ level, start, end, blocks, band: { top: top / available, height: Math.max(0, bottom - top) / available } });
    innerStart = start; innerEnd = end;
  }
  return levels;
};

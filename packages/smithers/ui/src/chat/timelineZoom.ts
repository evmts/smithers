/** Height-bounded octaves. Every level is necessary; the outermost covers all entries. */
export const timelineCapacity = (height: number): number => Math.max(2, Math.floor(Math.max(0, Number.isFinite(height) ? height : 0) / 34));
export const timelineLevelCount = (count: number, height: number): number => {
  if (count <= 0) return 0;
  const capacity = timelineCapacity(height);
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
/** Half-open entry ranges, clipped windows and proportional bands; no DOM or model dependency. */
export const timelineLevels = (ids: readonly string[], height: number, first: number, last: number): readonly TimelineLevel[] => {
  const count = ids.length, capacity = timelineCapacity(height), levels: TimelineLevel[] = [];
  let innerStart = Math.max(0, Math.min(count - 1, first));
  let innerEnd = Math.max(innerStart + 1, Math.min(count, last + 1));
  const center = (innerStart + innerEnd - 1) / 2;
  for (let level = 0; level < timelineLevelCount(count, height); level++) {
    const stride = 8 ** level, total = Math.ceil(count / stride);
    const startBlock = Math.max(0, Math.min(total - capacity, Math.floor(center / stride) - Math.floor(capacity / 2)));
    const endBlock = Math.min(total, startBlock + capacity);
    const start = startBlock * stride, end = Math.min(count, endBlock * stride);
    const blocks = Array.from({ length: endBlock - startBlock }, (_, offset) => {
      const a = (startBlock + offset) * stride, b = Math.min(count, a + stride);
      return { id: JSON.stringify([level, ...ids.slice(a, b)]), start: a, end: b };
    });
    const clippedStart = Math.max(start, innerStart), clippedEnd = Math.min(end, innerEnd);
    levels.push({ level, start, end, blocks, band: { top: (clippedStart - start) / (end - start), height: Math.max(0, clippedEnd - clippedStart) / (end - start) } });
    innerStart = start; innerEnd = end;
  }
  return levels;
};

import { expect, test } from "bun:test";
import { timelineCapacity, timelineLevelCount, timelineLevels } from "../src/chat/timelineZoom";

const ids = (count: number) => Array.from({ length: count }, (_, index) => `entry-${index}`);

test("wrapped labels reduce capacity and retain enough octaves for every entry", () => {
  expect(timelineCapacity(560)).toBe(16);
  expect(timelineCapacity(560, 55)).toBe(9);
  expect(timelineCapacity(406)).toBe(12);
  expect(timelineCapacity(405)).toBe(11);
  for (const height of [0, -1, NaN, Infinity]) expect(timelineCapacity(height)).toBe(2);
  expect(timelineCapacity(10, 0)).toBe(4);
  expect(timelineCapacity(560, NaN)).toBe(16);
  expect(timelineCapacity(560, Infinity)).toBe(16);
  expect(timelineLevelCount(0, 560)).toBe(0);
  expect(timelineLevels([], 560, 0, 0)).toEqual([]);
  expect(timelineLevelCount(128, 560)).toBe(2);
  expect(timelineLevelCount(128, 560, 55)).toBe(3);
  const levels = timelineLevels(ids(128), 560, 70, 72, 55);
  expect(levels.map(level => level.level)).toEqual([0, 1, 2]);
  expect(levels[0]!.blocks).toHaveLength(9);
  expect(levels.at(-1)!.start).toBe(0);
  expect(levels.at(-1)!.end).toBe(128);
});

test("bands follow padded, proportional rows including a short final group", () => {
  const levels = timelineLevels(ids(18), 560, 16, 17, 55);
  const detailed = levels[0]!;
  const row = (560 - 8 * 2) / 9;
  expect(detailed.start).toBe(9);
  expect(detailed.end).toBe(18);
  expect(detailed.band.top).toBeCloseTo((7 * (row + 2)) / 560, 10);
  expect(detailed.band.height).toBeCloseTo((2 * row + 2) / 560, 10);
  const coarse = levels[1]!;
  expect(coarse.blocks.map(block => [block.start, block.end])).toEqual([[0, 8], [8, 16], [16, 18]]);
  const free = 560 - 3 * 55 - 2 * 2;
  const fullGroup = 55 + free * 8 / 18;
  const top = fullGroup + 2 + fullGroup / 8;
  expect(coarse.band.top).toBeCloseTo(top / 560, 10);
  expect(coarse.band.height).toBeCloseTo((560 - top) / 560, 10);
  expect(coarse.band.top + coarse.band.height).toBeCloseTo(1, 10);
});

test("first, last, and tiny windows retain finite bands inside their columns", () => {
  for (const count of [1, 2, 9, 17, 129]) {
    for (const height of [NaN, Infinity, 0, 20, 408, 560]) {
      for (const first of [-1, 0, count - 1, count + 3]) {
        for (const level of timelineLevels(ids(count), height, first, first + 2, 55)) {
          expect(level.blocks.length).toBeGreaterThan(0);
          expect(level.blocks.length).toBeLessThanOrEqual(timelineCapacity(height, 55));
          expect(level.band.top).toBeGreaterThanOrEqual(0);
          expect(level.band.height).toBeGreaterThanOrEqual(0);
          expect(level.band.top + level.band.height).toBeLessThanOrEqual(1.0000000001);
        }
      }
    }
  }
});

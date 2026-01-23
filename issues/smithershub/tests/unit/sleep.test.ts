import { describe, test, expect, beforeAll, afterAll, spyOn } from "bun:test";
import { sleep } from "../../src/utils/sleep";

describe("sleep utility", () => {
  let perfNowSpy: ReturnType<typeof spyOn>;
  let timeouts: Array<{ callback: () => void; delay: number; id: number }> = [];
  let timeoutId = 1;

  beforeAll(() => {
    perfNowSpy = spyOn(performance, "now");
    // Mock setTimeout for controlled timing
    globalThis.setTimeout = (callback: () => void, delay: number) => {
      const id = timeoutId++;
      timeouts.push({ callback, delay, id });
      return id as any;
    };
  });

  afterAll(() => {
    perfNowSpy.mockRestore();
    timeouts = [];
    timeoutId = 1;
  });

  test("should return a promise that resolves after specified milliseconds", async () => {
    let startTime = 100;
    perfNowSpy.mockReturnValue(startTime);

    const promise = sleep(1000);

    // Verify setTimeout was called with correct delay
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(1000);

    // Simulate time passing and timeout executing
    perfNowSpy.mockReturnValue(startTime + 1000);
    timeouts[0].callback();

    await promise;
    expect(true).toBe(true); // Promise resolved successfully
  });

  test("should handle zero milliseconds", async () => {
    timeouts = []; // Reset
    perfNowSpy.mockReturnValue(200);

    const promise = sleep(0);

    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(0);

    perfNowSpy.mockReturnValue(200);
    timeouts[0].callback();

    await promise;
    expect(true).toBe(true); // Promise resolved successfully
  });

  test("should handle multiple concurrent sleeps", async () => {
    timeouts = []; // Reset
    perfNowSpy.mockReturnValue(300);

    const promise1 = sleep(100);
    const promise2 = sleep(200);

    expect(timeouts).toHaveLength(2);
    expect(timeouts[0].delay).toBe(100);
    expect(timeouts[1].delay).toBe(200);

    // Resolve first timeout
    perfNowSpy.mockReturnValue(400);
    timeouts[0].callback();
    await promise1;

    // Resolve second timeout
    perfNowSpy.mockReturnValue(500);
    timeouts[1].callback();
    await promise2;

    expect(true).toBe(true); // Both promises resolved successfully
  });

  test("should handle negative milliseconds as zero", async () => {
    timeouts = []; // Reset
    perfNowSpy.mockReturnValue(400);

    const promise = sleep(-500);

    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(0); // Should clamp to 0

    perfNowSpy.mockReturnValue(400);
    timeouts[0].callback();

    await promise;
    expect(true).toBe(true); // Promise resolved successfully
  });
});
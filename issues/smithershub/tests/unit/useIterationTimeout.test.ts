import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { useIterationTimeout } from "../../src/hooks/useIterationTimeout";

describe("useIterationTimeout hook", () => {
  let timeouts: Array<{ callback: () => void; delay: number; id: number }> = [];
  let timeoutId = 1;
  let perfNowSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    timeouts = [];
    timeoutId = 1;
    perfNowSpy = spyOn(performance, "now");

    // Mock setTimeout and clearTimeout
    globalThis.setTimeout = (callback: () => void, delay: number) => {
      const id = timeoutId++;
      timeouts.push({ callback, delay, id });
      return id as any;
    };

    globalThis.clearTimeout = (id: any) => {
      const index = timeouts.findIndex(t => t.id === id);
      if (index !== -1) {
        timeouts.splice(index, 1);
      }
    };
  });

  afterEach(() => {
    perfNowSpy.mockRestore();
    timeouts = [];
  });

  test("should return sleep function that uses configured timeout", async () => {
    const { result } = renderHook(() => useIterationTimeout(5000));

    perfNowSpy.mockReturnValue(100);

    act(() => {
      result.current.sleep();
    });

    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(5000);
  });

  test("should use default timeout when not provided", async () => {
    const { result } = renderHook(() => useIterationTimeout());

    perfNowSpy.mockReturnValue(100);

    act(() => {
      result.current.sleep();
    });

    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(10000); // Default 10 seconds
  });

  test("should handle timeout of zero", async () => {
    const { result } = renderHook(() => useIterationTimeout(0));

    perfNowSpy.mockReturnValue(100);

    act(() => {
      result.current.sleep();
    });

    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(0);
  });

  test("should return promise that resolves after timeout", async () => {
    const { result } = renderHook(() => useIterationTimeout(1000));

    perfNowSpy.mockReturnValue(100);

    const sleepPromise = result.current.sleep();

    expect(timeouts).toHaveLength(1);

    // Simulate timeout completion
    perfNowSpy.mockReturnValue(1100);
    timeouts[0].callback();

    await sleepPromise;
    expect(true).toBe(true); // Promise resolved successfully
  });

  test("should allow multiple concurrent sleep calls", async () => {
    const { result } = renderHook(() => useIterationTimeout(500));

    perfNowSpy.mockReturnValue(100);

    act(() => {
      result.current.sleep();
      result.current.sleep();
    });

    expect(timeouts).toHaveLength(2);
    expect(timeouts[0].delay).toBe(500);
    expect(timeouts[1].delay).toBe(500);
  });

  test("should update timeout when prop changes", () => {
    const { result, rerender } = renderHook(
      (props) => useIterationTimeout(props.timeout),
      { initialProps: { timeout: 1000 } }
    );

    perfNowSpy.mockReturnValue(100);

    act(() => {
      result.current.sleep();
    });

    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(1000);

    // Clear previous timeouts
    timeouts = [];

    // Update prop
    rerender({ timeout: 2000 });

    act(() => {
      result.current.sleep();
    });

    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(2000);
  });

  test("should handle undefined timeout gracefully", () => {
    const { result } = renderHook(() => useIterationTimeout(undefined));

    perfNowSpy.mockReturnValue(100);

    act(() => {
      result.current.sleep();
    });

    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(10000); // Should use default
  });
});
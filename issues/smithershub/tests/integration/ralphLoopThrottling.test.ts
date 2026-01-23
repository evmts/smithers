import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { createSmithersDB } from "smithers-orchestrator/db";
import { SmithersProvider } from "../../src/providers/SmithersProvider";

// Mock components for testing
function TestRalphLoop({ condition, onIteration }: {
  condition: () => boolean;
  onIteration: () => void;
}) {
  // Simulate Ralph loop behavior - this would normally be the Ralph component
  const intervalRef = { current: null as any };

  if (!intervalRef.current && condition()) {
    onIteration();
    intervalRef.current = setTimeout(() => {
      intervalRef.current = null;
      if (condition()) {
        onIteration();
      }
    }, 100); // Simulate quick iteration without throttling
  }

  return createElement('div', { 'data-testid': 'ralph-loop' }, 'Running');
}

describe("Ralph loop throttling integration", () => {
  let db: ReturnType<typeof createSmithersDB>;
  let timeouts: Array<{ callback: () => void; delay: number; id: number }> = [];
  let timeoutId = 1;
  let perfNowSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    db = createSmithersDB({ path: ":memory:" });
    timeouts = [];
    timeoutId = 1;
    perfNowSpy = spyOn(performance, "now");

    // Mock setTimeout for controlled timing
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

  afterEach(async () => {
    perfNowSpy.mockRestore();
    await db.close();
    timeouts = [];
  });

  test("should throttle Ralph loop iterations with custom timeout", async () => {
    const iterations: number[] = [];
    let iterationCount = 0;
    const customTimeout = 2000;

    perfNowSpy.mockReturnValue(1000);

    const executionId = db.execution.start("test", "ralphLoopThrottling.test.ts");

    render(
      createElement(SmithersProvider, {
        db,
        executionId,
        iterationTimeout: customTimeout,
        children: createElement(TestRalphLoop, {
          condition: () => iterationCount < 3,
          onIteration: () => {
            iterations.push(performance.now());
            iterationCount++;
          }
        })
      })
    );

    expect(screen.getByTestId('ralph-loop')).toBeInTheDocument();

    // Should have initial iteration immediately
    expect(iterations).toHaveLength(1);
    expect(iterations[0]).toBe(1000);

    // Should have created timeout for next iteration
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(customTimeout);

    // Simulate first timeout completion
    perfNowSpy.mockReturnValue(3000);
    timeouts[0].callback();
    timeouts.shift();

    // Should have second iteration and another timeout
    expect(iterations).toHaveLength(2);
    expect(iterations[1]).toBe(3000);
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(customTimeout);

    // Simulate second timeout completion
    perfNowSpy.mockReturnValue(5000);
    timeouts[0].callback();

    // Should have third iteration
    expect(iterations).toHaveLength(3);
    expect(iterations[2]).toBe(5000);

    // Verify throttling timing
    expect(iterations[1] - iterations[0]).toBe(2000); // 2 second gap
    expect(iterations[2] - iterations[1]).toBe(2000); // 2 second gap
  });

  test("should use default timeout when not specified", async () => {
    const iterations: number[] = [];
    let iterationCount = 0;

    perfNowSpy.mockReturnValue(2000);

    const executionId = db.execution.start("test", "ralphLoopThrottling.test.ts");

    render(
      createElement(SmithersProvider, {
        db,
        executionId,
        // No iterationTimeout specified - should use default
        children: createElement(TestRalphLoop, {
          condition: () => iterationCount < 2,
          onIteration: () => {
            iterations.push(performance.now());
            iterationCount++;
          }
        })
      })
    );

    // Should have initial iteration
    expect(iterations).toHaveLength(1);

    // Should use default 10 second timeout
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(10000);
  });

  test("should handle zero timeout without throttling", async () => {
    const iterations: number[] = [];
    let iterationCount = 0;

    perfNowSpy.mockReturnValue(3000);

    const executionId = db.execution.start("test", "ralphLoopThrottling.test.ts");

    render(
      createElement(SmithersProvider, {
        db,
        executionId,
        iterationTimeout: 0,
        children: createElement(TestRalphLoop, {
          condition: () => iterationCount < 2,
          onIteration: () => {
            iterations.push(performance.now());
            iterationCount++;
          }
        })
      })
    );

    // Should have initial iteration
    expect(iterations).toHaveLength(1);

    // Should use zero timeout (no delay)
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(0);

    // Complete timeout immediately
    timeouts[0].callback();

    expect(iterations).toHaveLength(2);
    expect(iterations[1] - iterations[0]).toBe(0); // No gap
  });

  test("should persist timeout configuration across provider updates", async () => {
    let iterationCount = 0;
    const initialTimeout = 1500;
    const updatedTimeout = 3000;

    perfNowSpy.mockReturnValue(4000);

    const executionId = db.execution.start("test", "ralphLoopThrottling.test.ts");

    const { rerender } = render(
      createElement(SmithersProvider, {
        db,
        executionId,
        iterationTimeout: initialTimeout,
        children: createElement(TestRalphLoop, {
          condition: () => iterationCount < 3,
          onIteration: () => { iterationCount++; }
        })
      })
    );

    // Initial timeout should be set
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(initialTimeout);

    // Update provider with new timeout
    rerender(
      createElement(SmithersProvider, {
        db,
        executionId,
        iterationTimeout: updatedTimeout,
        children: createElement(TestRalphLoop, {
          condition: () => iterationCount < 3,
          onIteration: () => { iterationCount++; }
        })
      })
    );

    // Complete current timeout
    timeouts[0].callback();
    timeouts.shift();

    // Next timeout should use updated value
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(updatedTimeout);
  });

  test("should handle rapid iteration condition changes", async () => {
    let shouldContinue = true;
    let iterationCount = 0;

    perfNowSpy.mockReturnValue(5000);

    const executionId = db.execution.start("test", "ralphLoopThrottling.test.ts");

    render(
      createElement(SmithersProvider, {
        db,
        executionId,
        iterationTimeout: 500,
        children: createElement(TestRalphLoop, {
          condition: () => shouldContinue,
          onIteration: () => {
            iterationCount++;
            if (iterationCount >= 2) {
              shouldContinue = false; // Stop after 2 iterations
            }
          }
        })
      })
    );

    expect(iterationCount).toBe(1);
    expect(timeouts).toHaveLength(1);

    // Complete timeout - should trigger second iteration
    timeouts[0].callback();
    expect(iterationCount).toBe(2);

    // Should not create new timeout since condition is now false
    expect(timeouts).toHaveLength(0);
  });
});
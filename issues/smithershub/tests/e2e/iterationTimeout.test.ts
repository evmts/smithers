import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { createElement } from "react";
import { createSmithersDB } from "smithers-orchestrator/db";
import { SmithersProvider } from "../../src/providers/SmithersProvider";

// Mock a realistic workflow component that uses Ralph-like behavior
function WorkflowWithIteration({
  maxIterations = 3,
  onIterationComplete
}: {
  maxIterations?: number;
  onIterationComplete?: (iteration: number, timestamp: number) => void;
}) {
  let currentIteration = 0;
  let isRunning = false;

  const startWorkflow = () => {
    if (isRunning) return;
    isRunning = true;

    const iterate = () => {
      if (currentIteration >= maxIterations) {
        isRunning = false;
        return;
      }

      currentIteration++;
      const timestamp = performance.now();
      onIterationComplete?.(currentIteration, timestamp);

      if (currentIteration < maxIterations) {
        // This simulates how Ralph would continue - the timeout should be applied here
        setTimeout(iterate, 50); // Quick internal timing, throttling handled by provider
      } else {
        isRunning = false;
      }
    };

    iterate();
  };

  return createElement('div', { 'data-testid': 'workflow' }, [
    createElement('button', {
      key: 'start-btn',
      'data-testid': 'start-workflow',
      onClick: startWorkflow,
      disabled: isRunning
    }, 'Start Workflow'),
    createElement('div', {
      key: 'iteration-display',
      'data-testid': 'current-iteration'
    }, `Iteration: ${currentIteration}`),
    createElement('div', {
      key: 'status-display',
      'data-testid': 'status'
    }, isRunning ? 'running' : 'idle')
  ]);
}

describe("Iteration timeout E2E", () => {
  let db: ReturnType<typeof createSmithersDB>;
  let timeouts: Array<{ callback: () => void; delay: number; id: number; created: number }> = [];
  let timeoutId = 1;
  let perfNowSpy: ReturnType<typeof spyOn>;
  let currentTime = 10000;

  beforeEach(() => {
    db = createSmithersDB({ path: ":memory:" });
    timeouts = [];
    timeoutId = 1;
    currentTime = 10000;

    perfNowSpy = spyOn(performance, "now");
    perfNowSpy.mockImplementation(() => currentTime);

    // Mock setTimeout to capture throttling behavior
    globalThis.setTimeout = (callback: () => void, delay: number) => {
      const id = timeoutId++;
      const timeout = { callback, delay, id, created: currentTime };
      timeouts.push(timeout);
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

  test("should throttle workflow iterations with custom timeout", async () => {
    const iterations: Array<{ iteration: number; timestamp: number }> = [];
    const customTimeout = 3000;

    const executionId = db.execution.start("workflow-test", "iterationTimeout.test.ts");

    render(
      createElement(SmithersProvider, {
        db,
        executionId,
        iterationTimeout: customTimeout,
        children: createElement(WorkflowWithIteration, {
          maxIterations: 3,
          onIterationComplete: (iteration, timestamp) => {
            iterations.push({ iteration, timestamp });
          }
        })
      })
    );

    expect(screen.getByTestId('workflow')).toBeInTheDocument();
    expect(screen.getByTestId('status')).toHaveTextContent('idle');

    // Start the workflow
    fireEvent.click(screen.getByTestId('start-workflow'));

    // First iteration should execute immediately
    expect(iterations).toHaveLength(1);
    expect(iterations[0]).toEqual({ iteration: 1, timestamp: 10000 });
    expect(screen.getByTestId('current-iteration')).toHaveTextContent('Iteration: 1');

    // Should have created a timeout for throttling
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(customTimeout);

    // Advance time and trigger timeout
    currentTime = 13000; // 3 seconds later
    perfNowSpy.mockReturnValue(currentTime);
    timeouts[0].callback();
    timeouts.shift();

    // Second iteration should execute
    await waitFor(() => {
      expect(iterations).toHaveLength(2);
    });
    expect(iterations[1]).toEqual({ iteration: 2, timestamp: 13000 });
    expect(screen.getByTestId('current-iteration')).toHaveTextContent('Iteration: 2');

    // Should have another timeout
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(customTimeout);

    // Advance time and trigger final timeout
    currentTime = 16000; // Another 3 seconds later
    perfNowSpy.mockReturnValue(currentTime);
    timeouts[0].callback();

    // Third and final iteration
    await waitFor(() => {
      expect(iterations).toHaveLength(3);
    });
    expect(iterations[2]).toEqual({ iteration: 3, timestamp: 16000 });
    expect(screen.getByTestId('current-iteration')).toHaveTextContent('Iteration: 3');
    expect(screen.getByTestId('status')).toHaveTextContent('idle');

    // Verify timing intervals
    expect(iterations[1].timestamp - iterations[0].timestamp).toBe(3000);
    expect(iterations[2].timestamp - iterations[1].timestamp).toBe(3000);
  });

  test("should use default 10 second timeout when not specified", async () => {
    const iterations: Array<{ iteration: number; timestamp: number }> = [];

    const executionId = db.execution.start("default-timeout-test", "iterationTimeout.test.ts");

    render(
      createElement(SmithersProvider, {
        db,
        executionId,
        // No iterationTimeout specified
        children: createElement(WorkflowWithIteration, {
          maxIterations: 2,
          onIterationComplete: (iteration, timestamp) => {
            iterations.push({ iteration, timestamp });
          }
        })
      })
    );

    fireEvent.click(screen.getByTestId('start-workflow'));

    // First iteration immediate
    expect(iterations).toHaveLength(1);

    // Should use default 10 second timeout
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(10000); // Default 10 seconds
  });

  test("should handle zero timeout for immediate iteration", async () => {
    const iterations: Array<{ iteration: number; timestamp: number }> = [];

    const executionId = db.execution.start("zero-timeout-test", "iterationTimeout.test.ts");

    render(
      createElement(SmithersProvider, {
        db,
        executionId,
        iterationTimeout: 0,
        children: createElement(WorkflowWithIteration, {
          maxIterations: 2,
          onIterationComplete: (iteration, timestamp) => {
            iterations.push({ iteration, timestamp });
          }
        })
      })
    );

    fireEvent.click(screen.getByTestId('start-workflow'));

    // First iteration immediate
    expect(iterations).toHaveLength(1);

    // Should use zero timeout
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(0);

    // Trigger immediate timeout
    timeouts[0].callback();

    // Second iteration should execute immediately
    await waitFor(() => {
      expect(iterations).toHaveLength(2);
    });

    // Time difference should be minimal (same timestamp since no delay)
    expect(iterations[1].timestamp - iterations[0].timestamp).toBe(0);
  });

  test("should maintain throttling across workflow restarts", async () => {
    const iterations: Array<{ iteration: number; timestamp: number }> = [];
    const timeout = 1500;

    const executionId = db.execution.start("restart-test", "iterationTimeout.test.ts");

    const { rerender } = render(
      createElement(SmithersProvider, {
        db,
        executionId,
        iterationTimeout: timeout,
        children: createElement(WorkflowWithIteration, {
          maxIterations: 1, // Single iteration
          onIterationComplete: (iteration, timestamp) => {
            iterations.push({ iteration, timestamp });
          }
        })
      })
    );

    fireEvent.click(screen.getByTestId('start-workflow'));
    expect(iterations).toHaveLength(1);

    // Wait for workflow to complete
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('idle');
    });

    // Rerender with new workflow instance
    currentTime = 11500; // Advance time
    perfNowSpy.mockReturnValue(currentTime);

    rerender(
      createElement(SmithersProvider, {
        db,
        executionId,
        iterationTimeout: timeout,
        children: createElement(WorkflowWithIteration, {
          maxIterations: 1,
          onIterationComplete: (iteration, timestamp) => {
            iterations.push({ iteration, timestamp });
          }
        })
      })
    );

    fireEvent.click(screen.getByTestId('start-workflow'));

    // Should still apply throttling
    expect(iterations).toHaveLength(2);
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(timeout);
  });

  test("should handle dynamic timeout changes during execution", async () => {
    const iterations: Array<{ iteration: number; timestamp: number }> = [];
    let maxIterations = 3;

    const executionId = db.execution.start("dynamic-timeout-test", "iterationTimeout.test.ts");

    const { rerender } = render(
      createElement(SmithersProvider, {
        db,
        executionId,
        iterationTimeout: 2000,
        children: createElement(WorkflowWithIteration, {
          maxIterations,
          onIterationComplete: (iteration, timestamp) => {
            iterations.push({ iteration, timestamp });
          }
        })
      })
    );

    fireEvent.click(screen.getByTestId('start-workflow'));
    expect(iterations).toHaveLength(1);

    // First timeout should be 2000ms
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(2000);

    // Change timeout mid-execution
    rerender(
      createElement(SmithersProvider, {
        db,
        executionId,
        iterationTimeout: 5000, // Changed to 5 seconds
        children: createElement(WorkflowWithIteration, {
          maxIterations,
          onIterationComplete: (iteration, timestamp) => {
            iterations.push({ iteration, timestamp });
          }
        })
      })
    );

    // Complete current timeout
    currentTime = 12000;
    perfNowSpy.mockReturnValue(currentTime);
    timeouts[0].callback();
    timeouts.shift();

    await waitFor(() => {
      expect(iterations).toHaveLength(2);
    });

    // Next timeout should use new value
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].delay).toBe(5000);
  });
});
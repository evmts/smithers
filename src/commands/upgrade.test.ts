import { test, expect, mock } from "bun:test";
import { runUpgrade, computeUpgradePlan } from "./upgrade";

test("smithers upgrade runs bun add -g smithers-orchestrator@latest", () => {
  const runner = mock((_cmd: string, _args: string[]) => ({ exitCode: 0, stdout: "", stderr: "" }));

  const { plan, exitCode } = runUpgrade(runner, {
    HOME: "/Users/alice",
    PATH: "/Users/alice/.bun/bin:/usr/bin",
  } as NodeJS.ProcessEnv);

  expect(exitCode).toBe(0);
  expect(plan.cmd).toBe("bun");
  expect(plan.args).toEqual(["add", "-g", "smithers-orchestrator@latest"]);
  expect(runner).toHaveBeenCalledTimes(1);
});

test("computeUpgradePlan detects bun global install", () => {
  const plan = computeUpgradePlan({
    HOME: "/Users/bob",
    PATH: "/Users/bob/.bun/bin:/usr/local/bin",
  } as NodeJS.ProcessEnv);

  expect(plan.manager).toBe("bun");
  expect(plan.cmd).toBe("bun");
  expect(plan.args).toEqual(["add", "-g", "smithers-orchestrator@latest"]);
});

test("computeUpgradePlan falls back to bun for unknown install", () => {
  const plan = computeUpgradePlan({
    HOME: "/Users/charlie",
    PATH: "/some/random/path:/usr/bin",
  } as NodeJS.ProcessEnv);

  expect(plan.manager).toBe("unknown");
  expect(plan.cmd).toBe("bun");
  expect(plan.args).toEqual(["add", "-g", "smithers-orchestrator@latest"]);
});

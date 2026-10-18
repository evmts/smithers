/**
 * The fault primitives, against the operating system that has to honour them.
 *
 * A harness that lies makes every case built on it a lie too, so these suites
 * inject the fault for real: a live child is killed and reaped, a grandchild is
 * orphaned and observed being reparented, and the patched clock is read back
 * through the same `Date` a durable timer reads. They ran in the standalone
 * `e2e/` matrix before it was dissolved into the packages it tested; the
 * primitives are the one part of it that belongs to every package rather than
 * to any of them.
 *
 * They sit in the ordinary tier rather than in a `faults` one, unlike every
 * suite built on top of them. A fault CASE is machine-global because it kills
 * an engine somebody else's suite might also be running; these tests only ever
 * signal pids they spawned themselves, so nothing here can reach a neighbour.
 * Staying here is what keeps `src/Faults.ts` inside this package's 100%
 * coverage denominator, which `packages/smithers/flows/test/vitestCoverageIsolation.test.ts`
 * refuses to let any config carve an exception out of.
 */
import { spawn } from "node:child_process"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  isAlive,
  isGroupAlive,
  killGroup,
  killProcess,
  parentPid,
  skewClock,
  type SkewedClock,
  waitFor,
  waitForReparent
} from "../src/Faults.ts"
import * as ProcessTable from "../src/ProcessTable.ts"

vi.mock(
  "../src/ProcessTable.ts",
  async (original) => ({ ...await original<typeof import("../src/ProcessTable.ts")>() })
)

/**
 * Every child a case spawns, so `afterEach` stops the survivors. A case that fails before its
 * own kill would otherwise leave an idle `node -e` running after vitest exits, reparented to
 * pid 1 (eight such orphans built up on the shared Mac mini).
 */
const spawned: Array<ReturnType<typeof spawn>> = []
const sleeper = () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
  spawned.push(child)
  return child
}
afterEach(() => {
  for (const child of spawned.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
  }
})

describe("invalid process identifiers", () => {
  it.each([0, -0, -1, NaN, 1.5, Infinity])("rejects %s without signalling anything", async (pid) => {
    // Intercept every signal, including signal 0, so a regression cannot kill the runner.
    const kill = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("intercepted signal"), { code: "ESRCH" })
    })
    try {
      await expect(killProcess({ pid })).rejects.toThrow(/invalid pid/)
      expect(isAlive(pid)).toBe(false)
      expect(isGroupAlive(pid)).toBe(false)
      expect(() => killGroup(pid)).not.toThrow()
      expect(kill).not.toHaveBeenCalled()
    } finally {
      kill.mockRestore()
    }
  })
})

describe("process group syscall boundary", () => {
  it("waits until the observed parent changes", async () => {
    const query = vi.spyOn(ProcessTable, "query")
      .mockReturnValueOnce("123\n")
      .mockReturnValueOnce("456\n")
    try {
      await expect(waitForReparent(12345, 123)).resolves.toBe(456)
      expect(query).toHaveBeenCalledTimes(2)
      expect(query).toHaveBeenLastCalledWith({ pid: 12345, columns: ["ppid"] })
    } finally {
      query.mockRestore()
    }
  })

  it("distinguishes a live group, absence, and denied inspection", () => {
    const kill = vi.spyOn(process, "kill").mockReturnValue(true)
    try {
      expect(isGroupAlive(12345)).toBe(true)
      kill.mockImplementationOnce(() => {
        throw Object.assign(new Error("gone"), { code: "ESRCH" })
      })
      expect(isGroupAlive(12345)).toBe(false)
      kill.mockImplementationOnce(() => {
        throw Object.assign(new Error("denied"), { code: "EPERM" })
      })
      expect(isGroupAlive(12345)).toBe(true)
      expect(kill.mock.calls).toEqual([[-12345, 0], [-12345, 0], [-12345, 0]])
    } finally {
      kill.mockRestore()
    }
  })

  it("uses the default and requested group signals and contains teardown errors", () => {
    const kill = vi.spyOn(process, "kill").mockReturnValue(true)
    try {
      killGroup(12345)
      killGroup(12345, "SIGTERM")
      kill.mockImplementationOnce(() => {
        throw Object.assign(new Error("denied"), { code: "EPERM" })
      })
      expect(() => killGroup(12345)).not.toThrow()
      expect(kill.mock.calls).toEqual([[-12345, "SIGKILL"], [-12345, "SIGTERM"], [-12345, "SIGKILL"]])
    } finally {
      kill.mockRestore()
    }
  })
})

describe("killProcess", () => {
  it("kills a real process and waits for the operating system to reap it", async () => {
    const child = sleeper()
    const pid = child.pid as number
    expect(isAlive(pid)).toBe(true)
    await killProcess(child)
    expect(isAlive(pid)).toBe(false)
  })

  it("refuses a pid that is already dead, so a suite cannot claim a fault it never injected", async () => {
    const child = sleeper()
    const pid = child.pid as number
    await killProcess(child)
    await expect(killProcess({ pid })).rejects.toThrow(/already dead/)
  })

  it("rejects a handle with no pid", async () => {
    await expect(killProcess({ pid: undefined })).rejects.toThrow(/invalid pid/)
  })

  it("reads the parent of a live process and nothing for a dead one", async () => {
    const child = sleeper()
    const pid = child.pid as number
    expect(parentPid(pid)).toBe(process.pid)
    await killProcess(child)
    expect(parentPid(pid)).toBeUndefined()
  })

  it.skipIf(process.platform === "win32")(
    "observes the orphan a kill leaves: the grandchild is reparented away from its dead parent",
    async () => {
      // A process group whose leader is the killed child. Killing the child
      // orphans the group, which is the state every crash case then asserts on.
      const parent = spawn("sh", ["-c", "sh -c 'sleep 30' & echo $! && sleep 30"], {
        stdio: ["ignore", "pipe", "ignore"],
        detached: true
      })
      const parentPidValue = parent.pid as number
      const grandchild = await new Promise<number>((resolve) => {
        parent.stdout?.setEncoding("utf8")
        parent.stdout?.once("data", (chunk: string) => resolve(Number(chunk.trim())))
      })
      try {
        expect(parentPid(grandchild)).toBe(parentPidValue)
        await killProcess(parent)
        const reparented = await waitForReparent(grandchild, parentPidValue)
        expect(reparented).not.toBe(parentPidValue)
        expect(isAlive(grandchild)).toBe(true)
      } finally {
        killGroup(parentPidValue)
      }
    }
  )

  it("rejects a timeout that is NaN or negative instead of waiting forever", async () => {
    // A NaN deadline never compares as reached, so the wait would spin until
    // the test runner kills the suite. Each helper refuses it before waiting.
    for (const bad of [Number.NaN, -1]) {
      await expect(waitFor(() => false, "never", bad)).rejects.toThrow(RangeError)
      await expect(waitForReparent(process.pid, process.ppid, bad)).rejects.toThrow(RangeError)
      await expect(killProcess({ pid: process.pid }, "SIGCONT", bad)).rejects.toThrow(RangeError)
    }
  })

  it("times out with the label it was given", async () => {
    await expect(waitFor(() => false, "a condition that never holds", 100))
      .rejects.toThrow(/a condition that never holds/)
  })

  it.skipIf(process.platform === "win32")(
    "sees a whole process group, and stops seeing it once the group is gone",
    async () => {
      // The group, not the pid, is the unit `NodeRuntime.layerHost` contains, so
      // the fault tier asks about it directly. A detached child is its own group
      // leader, which makes its pid the pgid.
      const leader = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        stdio: "ignore",
        detached: true
      })
      const pgid = leader.pid as number
      try {
        expect(isGroupAlive(pgid)).toBe(true)
      } finally {
        killGroup(pgid)
      }
      await waitFor(() => !isGroupAlive(pgid), `process group ${pgid} to leave`)
      expect(isGroupAlive(pgid)).toBe(false)
    }
  )

  it("refuses to wait for the reparenting of a process that is already gone", async () => {
    const child = sleeper()
    const pid = child.pid as number
    await killProcess(child)
    await expect(waitForReparent(pid, process.pid)).rejects.toThrow(/exited before it could be reparented/)
  })

  it("gives up on a reparenting that never happens, naming the parent it kept", async () => {
    const child = sleeper()
    const pid = child.pid as number
    // Confirm the real parent separately. Windows' synchronous PowerShell
    // probe can exceed this test's entire deadline, so the timeout contract
    // uses a fixed parent observation while the real monotonic wait runs.
    expect(parentPid(pid)).toBe(process.pid)
    const probe = vi.spyOn(ProcessTable, "query").mockReturnValue(`${process.pid}\n`)
    try {
      const waiting = waitForReparent(pid, process.pid, 100)
      let settled = false
      void waiting.then(() => {
        settled = true
      }, () => {
        settled = true
      })
      await Promise.resolve()
      expect(settled).toBe(false)
      await expect(waiting).rejects.toThrow(
        new RegExp(`still reports parent ${process.pid} after 100ms`)
      )
    } finally {
      expect(probe.mock.calls.length).toBeGreaterThan(1)
      probe.mockRestore()
      await killProcess(child)
    }
  })

  it("re-raises a kill failure that is not a missing process", async () => {
    // `ESRCH` is the one code that means "the fault injected nothing"; every
    // other failure is the caller's and has to surface unchanged rather than
    // be reported as a corpse.
    const child = sleeper()
    try {
      await expect(killProcess(child, "NOT_A_SIGNAL" as NodeJS.Signals)).rejects.toThrow(/NOT_A_SIGNAL/)
    } finally {
      await killProcess(child)
    }
  })
})

let live: SkewedClock | undefined
afterEach(() => {
  live?.restore()
  live = undefined
})

describe("skewClock", () => {
  it("keeps Date callable and returns the skewed instant as a string", () => {
    const OriginalDate = Date
    const before = Date.now()
    live = skewClock(60_000)
    const value = Date()
    expect(typeof value).toBe("string")
    expect(OriginalDate.parse(value)).toBeGreaterThanOrEqual(before + 59_000)
    expect(OriginalDate.parse(value)).toBeLessThanOrEqual(Date.now())
    // Date's call form ignores arguments, unlike construction.
    const calledAt = Date.now()
    const ignoredArgument = Reflect.apply(Date, undefined, [0])
    expect(OriginalDate.parse(ignoredArgument)).toBeGreaterThanOrEqual(calledAt - 999)
    expect(OriginalDate.parse(ignoredArgument)).toBeLessThanOrEqual(Date.now())
  })

  it.each([false, true])("restores the real clock with overlapping skews (reverse: %s)", (reverse) => {
    const OriginalDate = Date
    const originalNow = Date.now
    const first = skewClock(60_000)
    const second = skewClock(120_000)
    try {
      const clocks = reverse ? [second, first] : [first, second]
      for (const clock of clocks) {
        clock.restore()
        expect(Date).toBe(OriginalDate)
        expect(Date.now).toBe(originalNow)
      }
    } finally {
      first.restore()
      second.restore()
      // Also isolate this regression test when run against the broken implementation.
      globalThis.Date = OriginalDate
      OriginalDate.now = originalNow
    }
  })

  it("preserves Date statics, prototypes, explicit arguments, and subclass construction", () => {
    const OriginalDate = Date
    live = skewClock(60_000)
    expect(Date.prototype).toBe(OriginalDate.prototype)
    expect(Date.parse).toBe(OriginalDate.parse)
    expect(Date.UTC).toBe(OriginalDate.UTC)
    expect(new Date()).toBeInstanceOf(Date)
    expect(new Date()).toBeInstanceOf(OriginalDate)
    expect(new Date(2020, 0, 2, 3, 4, 5, 6).getTime()).toBe(new OriginalDate(2020, 0, 2, 3, 4, 5, 6).getTime())
    class CustomDate extends Date {}
    const custom = new CustomDate()
    expect(custom).toBeInstanceOf(CustomDate)
    expect(custom.getTime()).toBeGreaterThanOrEqual(live.now() - 1_000)
  })

  it("moves Date.now and a bare new Date forward together", () => {
    const before = Date.now()
    live = skewClock(60_000)
    const after = Date.now()
    expect(after - before).toBeGreaterThanOrEqual(59_000)
    expect(new Date().getTime() - before).toBeGreaterThanOrEqual(59_000)
  })

  it("leaves an explicit Date argument alone", () => {
    live = skewClock(60_000)
    expect(new Date(0).getTime()).toBe(0)
    expect(new Date("2020-01-01T00:00:00.000Z").getTime()).toBe(1577836800000)
  })

  it("advances further without re-patching", () => {
    live = skewClock(1_000)
    const first = Date.now()
    live.advance(5_000)
    expect(Date.now() - first).toBeGreaterThanOrEqual(4_900)
  })

  it("rejects a skew or an advance that is not a finite number of milliseconds", () => {
    const real = Date.now()
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => skewClock(bad)).toThrow(RangeError)
    }
    expect(Math.abs(Date.now() - real)).toBeLessThan(5_000)
    live = skewClock(1_000)
    expect(() => live!.advance(Number.NaN)).toThrow(RangeError)
    expect(Number.isFinite(Date.now())).toBe(true)
  })

  it("keeps waitFor's deadline on the real clock when the clock jumps forward mid-wait", async () => {
    live = skewClock(0)
    let polls = 0
    await waitFor(
      () => {
        polls += 1
        if (polls === 1) live!.advance(3_600_000)
        return polls >= 3
      },
      "a condition that holds on the third poll",
      2_000
    )
    expect(polls).toBe(3)
  })

  it("keeps waitFor's deadline on the real clock when the clock jumps backward mid-wait", async () => {
    live = skewClock(0)
    let polls = 0
    const started = performance.now()
    await expect(waitFor(
      () => {
        polls += 1
        if (polls === 1) live!.advance(-3_600_000)
        return false
      },
      "a condition that never holds",
      200
    )).rejects.toThrow(/a condition that never holds/)
    expect(performance.now() - started).toBeLessThan(2_000)
  })

  it("restores the real clock, and restoring twice is a no-op", () => {
    const real = Date.now()
    const clock = skewClock(3_600_000)
    clock.restore()
    clock.restore()
    expect(Math.abs(Date.now() - real)).toBeLessThan(5_000)
    expect(Date.now).toBe(Date.now)
  })
})

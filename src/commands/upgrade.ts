import * as path from "node:path";
import * as fs from "node:fs";

type PackageManager = "bun" | "npm" | "pnpm" | "yarn" | "unknown";

export type Runner = (cmd: string, args: string[]) => { exitCode: number; stdout: string; stderr: string };

export type UpgradePlan = {
  manager: PackageManager;
  cmd: string;
  args: string[];
  smithersPath: string;
};

function isWin() {
  return process.platform === "win32";
}

/**
 * Resolve the full path to `smithers` by scanning PATH (i.e., what `which` does).
 */
export function resolveSmithersPath(env = process.env): string {
  const PATH = env["PATH"] ?? "";
  const parts = PATH.split(path.delimiter).filter(Boolean);

  const base = "smithers";
  const exts = isWin()
    ? (env["PATHEXT"] ?? ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];

  for (const dir of parts) {
    for (const ext of exts) {
      const candidate = path.join(dir, base + ext);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // ignore and continue
      }
    }
  }
  return "smithers";
}

function normalize(p: string) {
  return p.replace(/\\/g, "/");
}

function within(child: string, parent: string) {
  const c = normalize(child);
  const p = normalize(parent).replace(/\/+$/, "");
  return c === p || c.startsWith(p + "/");
}

export function computeUpgradePlan(env = process.env): UpgradePlan {
  const smithersPath = resolveSmithersPath(env);
  const bunBinDefault = normalize(path.join(env["HOME"] ?? "", ".bun", "bin"));
  const bunInstall = env["BUN_INSTALL"] ? normalize(path.join(env["BUN_INSTALL"], "bin")) : bunBinDefault;

  const pathDirs = (env["PATH"] ?? "").split(path.delimiter).map(normalize);
  const hasBunInPath = pathDirs.some(dir => dir === bunInstall || within(dir, bunInstall) || within(bunInstall, dir));

  if (within(smithersPath, bunInstall) || hasBunInPath) {
    return {
      manager: "bun",
      cmd: "bun",
      args: ["add", "-g", "smithers-orchestrator@latest"],
      smithersPath,
    };
  }

  return {
    manager: "unknown",
    cmd: "bun",
    args: ["add", "-g", "smithers-orchestrator@latest"],
    smithersPath,
  };
}

export function runUpgrade(runner: Runner, env = process.env): { plan: UpgradePlan; exitCode: number } {
  const plan = computeUpgradePlan(env);
  const res = runner(plan.cmd, plan.args);
  return { plan, exitCode: res.exitCode };
}

const bunRunner: Runner = (cmd, args) => {
  const proc = Bun.spawnSync([cmd, ...args], { stdout: "pipe", stderr: "pipe" });
  return {
    exitCode: proc.exitCode,
    stdout: Buffer.from(proc.stdout ?? new ArrayBuffer(0)).toString(),
    stderr: Buffer.from(proc.stderr ?? new ArrayBuffer(0)).toString(),
  };
};

export function upgradeCommand(): number {
  const { plan, exitCode } = runUpgrade(bunRunner, process.env);

  if (exitCode === 0) {
    console.log(`Upgraded smithers via ${plan.cmd}: ${plan.args.join(" ")}`);
    return 0;
  }

  console.error(`Upgrade failed (exit ${exitCode}). Tried: ${plan.cmd} ${plan.args.join(" ")}`);
  return exitCode;
}

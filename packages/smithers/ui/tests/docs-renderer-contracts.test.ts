import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../package.json";

const readDoc = (path: string): string => readFileSync(join(import.meta.dir, "../docs", path), "utf8");

describe("documented installation contracts", () => {
  test("both installation requirements and copyable dependencies match the React peers", () => {
    const installation = readDoc("installation.md");
    const requirements = installation.split("## Requirements")[1]!.split("## Add the dependency")[0]!;
    const example = JSON.parse(installation.match(/```json\n([\s\S]*?)```/)![1]!);
    expect(requirements).toContain(`\`${manifest.peerDependencies.react}\``);
    expect(requirements).toContain(`\`react-dom ${manifest.peerDependencies["react-dom"]}\``);
    for (const peer of ["react", "react-dom"] as const) {
      expect(example.dependencies[peer]).toBe(manifest.peerDependencies[peer]);
    }
  });
});

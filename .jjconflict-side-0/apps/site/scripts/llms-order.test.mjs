/** The smithers.sh Copy Prompt hands an agent llms-full.txt: it must open with what works today. */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const site = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (path) => readFileSync(join(site, path), "utf8")
const guideUrl = "https://github.com/smithersai/smithers/blob/main/packages/smithers/docs/guides/change-code.md"

test("llms-full.txt opens with the npm install, then the coding guide", () => {
  const full = read("public/llms-full.txt")
  const [install, guide] = full.split("\n\n---\n\n")
  assert.match(install, /\n# Install Smithers\n/)
  const npm = install.indexOf("npm install -g smthrs@next")
  assert.ok(npm > 0, "the first page installs the CLI from npm")
  const brew = install.indexOf("brew install smithersai/tap")
  assert.ok(brew === -1 || brew > npm, "the planned Homebrew host comes after the npm install")
  assert.ok(guide.startsWith(`# Change your code with a flow\n${guideUrl}\n\n`), "the coding guide is the second page")
  assert.match(guide, /smthrs flow start coding --data/)
  assert.doesNotMatch(guide, /\]\(\.\.?\//, "the guide's relative links resolve to GitHub")
  assert.doesNotMatch(full, /reviewed, tested/)
})

test("llms.txt starts with the install page, then the coding guide", () => {
  const start = read("public/llms.txt").split("## Start here\n\n")[1].split("\n\n")[0].split("\n")
  assert.match(start[0], /^- \[Install Smithers\]\(https:\/\/smithers\.sh\/docs\/installation\/\)/)
  assert.ok(start[1].startsWith(`- [Change your code with a flow](${guideUrl})`), start[1])
})

// NOTE: this script is base64-encoded and executed by the workspace bootstrap via
// `node -e 'void eval(Buffer.from(argv, "base64").toString())'` (see
// bootstrap.sh.tmpl). `eval` runs in a CommonJS script context and does NOT strip
// TypeScript types or support ESM `import` — so this MUST stay plain CommonJS
// JavaScript (require(), no `import`, no type annotations). Using ESM `import`
// here throws "Cannot use import statement outside a module" and silently breaks
// the jj/node install, which makes workspace clones fail.
const { createWriteStream, writeFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { finished } = require("node:stream/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { Readable } = require("node:stream");
const runFile = promisify(execFile);
const os = require("node:os");

const mode = process.env.SMITHERS_DOWNLOAD_MODE; // "jj" or "node"

async function request(url, headers) {
  // Native https.get ignores the guest's mandatory HTTPS_PROXY. curl honors
  // that proxy and CURL_CA_BUNDLE, including redirects to release assets.
  const args = ["--fail", "--silent", "--show-error", "--location",
    "--connect-timeout", "15", "--max-time", "120"];
  for (const [name, value] of Object.entries(headers || {})) {
    args.push("--header", name + ": " + value);
  }
  args.push("--", url);
  const { stdout } = await runFile("curl", args, {
    encoding: "buffer", maxBuffer: 256 * 1024 * 1024,
  });
  return Readable.from([stdout]);
}

async function downloadJJ() {
  const targetMap = {
    x64: "x86_64-unknown-linux-musl",
    arm64: "aarch64-unknown-linux-musl",
  };

  const target = targetMap[os.arch()];
  if (!target) {
    throw new Error("unsupported architecture: " + os.arch());
  }

  const releaseUrl =
    process.env.SMITHERS_JJ_RELEASE_API_URL ||
    "https://api.github.com/repos/jj-vcs/jj/releases/latest";
  const releaseResponse = await request(releaseUrl, {
    Accept: "application/vnd.github+json",
    "User-Agent": "smithers-workspace-bootstrap",
  });
  const releaseChunks = [];
  for await (const chunk of releaseResponse) {
    releaseChunks.push(Buffer.from(chunk));
  }
  const release = JSON.parse(Buffer.concat(releaseChunks).toString("utf8"));
  const asset = (release.assets || []).find(
    (candidate) =>
      candidate &&
      typeof candidate.name === "string" &&
      candidate.name.includes(target) &&
      candidate.name.endsWith(".tar.gz"),
  );
  if (!asset || !asset.browser_download_url) {
    throw new Error("jj release asset not found for target " + target);
  }

  const archivePath = process.env.SMITHERS_JJ_ARCHIVE;
  if (!archivePath) {
    throw new Error("SMITHERS_JJ_ARCHIVE is required");
  }

  const archiveResponse = await request(asset.browser_download_url);
  const file = createWriteStream(archivePath);
  archiveResponse.pipe(file);
  await finished(file);
}

// Node is pinned (Security f-ye4hz9): one exact release, written only after
// its SHA-256 matches the digest the bootstrap pins for this architecture. A
// mismatch writes no archive, so the bootstrap installs nothing.
async function downloadNode() {
  const targetMap = {
    x64: "linux-x64",
    arm64: "linux-arm64",
  };
  const digests = {
    x64: process.env.SMITHERS_NODE_SHA256_X64,
    arm64: process.env.SMITHERS_NODE_SHA256_ARM64,
  };

  const target = targetMap[os.arch()];
  if (!target) {
    throw new Error("unsupported architecture: " + os.arch());
  }
  const version = process.env.SMITHERS_NODE_VERSION || "";
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
    throw new Error("SMITHERS_NODE_VERSION must be an exact version, got: " + version);
  }
  const expected = String(digests[os.arch()] || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    throw new Error("no pinned SHA-256 for Node " + version + " " + target);
  }

  const archivePath = process.env.SMITHERS_NODE_ARCHIVE;
  if (!archivePath) {
    throw new Error("SMITHERS_NODE_ARCHIVE is required");
  }

  const distUrl = process.env.SMITHERS_NODE_DIST_URL || "https://nodejs.org/dist";
  const archiveUrl =
    distUrl + "/v" + version + "/node-v" + version + "-" + target + ".tar.gz";
  const chunks = [];
  for await (const chunk of await request(archiveUrl)) {
    chunks.push(Buffer.from(chunk));
  }
  const archive = Buffer.concat(chunks);
  const actual = createHash("sha256").update(archive).digest("hex");
  if (actual !== expected) {
    throw new Error(
      "refusing Node " + version + " " + target + ": SHA-256 " + actual +
        " does not match the pinned " + expected,
    );
  }
  writeFileSync(archivePath, archive, { flag: "wx" });
}

(async () => {
  if (mode === "jj") {
    await downloadJJ();
  } else if (mode === "node") {
    await downloadNode();
  } else {
    throw new Error(
      'SMITHERS_DOWNLOAD_MODE must be "jj" or "node", got: ' + mode,
    );
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

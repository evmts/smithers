#!/usr/bin/env node
// One GIF per e2e flow, from the videos the last Playwright run recorded.
//
//   node e2e/gifs.mjs [test-results] [out-dir]
//
// Every test writes flow.json (e2e/fixtures.ts, one page) or devices.json (e2e/devices.ts, one video per tab) beside
// its videos. This lays a flow's videos side by side, each starting when its tab opened, then writes
// <out-dir>/<flow>.gif: 900 px wide, 10 fps, a small shared palette.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const results = process.argv[2] ?? "test-results"
const outDir = process.argv[3] ?? join(homedir(), "Desktop/smithers-mvp/gifs")
const WIDTH = 900
const PANE_HEIGHT = 720
const GAP = 6

const duration = (file) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim())

// devices.json wins over flow.json in the same directory: a devices test has no default page.
const manifests = readdirSync(results, { recursive: true })
  .map(String)
  .filter((path) => path.endsWith("devices.json") || path.endsWith("flow.json"))
const byDir = new Map()
for (const path of manifests) {
  const dir = path.slice(0, path.lastIndexOf("/"))
  if (byDir.has(dir) && path.endsWith("flow.json")) continue
  const flow = JSON.parse(readFileSync(join(results, path), "utf8"))
  // A relative video path is beside its manifest.
  for (const video of flow.videos) if (video.video && !video.video.startsWith("/")) video.video = join(results, dir, video.video)
  byDir.set(dir, flow)
}

mkdirSync(outDir, { recursive: true })
const made = []
for (const flow of [...byDir.values()].sort((left, right) => left.flow.localeCompare(right.flow))) {
  const videos = flow.videos.filter((video) => video.video && existsSync(video.video) && statSync(video.video).size > 0)
  if (videos.length === 0) {
    console.log(`skipped  ${flow.flow}: no video`)
    continue
  }
  const timed = videos.map((video) => ({ ...video, duration: duration(video.video) }))
  const end = Math.max(...timed.map((video) => video.openedAt + video.duration))
  // Each pane keeps its aspect at a common height, padded to that height; panes are separated by a thin dark gap.
  const panes = timed.map((video, index) => {
    const last = index === timed.length - 1
    return (
      `[${index}:v]setpts=PTS-STARTPTS,scale=-2:${PANE_HEIGHT},` +
      `pad=iw+${last ? 0 : GAP}:${PANE_HEIGHT}:0:0:color=0x1f2937,` +
      `tpad=start_duration=${video.openedAt.toFixed(3)}:start_mode=add:color=0xe5e7eb:` +
      `stop_duration=${Math.max(0, end - video.openedAt - video.duration).toFixed(3)}:stop_mode=clone[p${index}]`
    )
  })
  const stack = timed.length === 1 ? "[p0]null[s]" : `${timed.map((_, index) => `[p${index}]`).join("")}hstack=inputs=${timed.length}[s]`
  const gif =
    `[s]fps=10,scale=${WIDTH}:-2:flags=lanczos,split[a][b];` +
    "[a]palettegen=max_colors=64:stats_mode=diff[palette];" +
    "[b][palette]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle"
  const out = join(outDir, `${flow.flow}.gif`)
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    ...timed.flatMap((video) => ["-i", video.video]),
    "-filter_complex",
    [...panes, stack, gif].join(";"),
    "-t",
    end.toFixed(3),
    out,
  ])
  const size = (statSync(out).size / 1024 / 1024).toFixed(1)
  made.push(out)
  console.log(`${String(flow.status).padEnd(8)} ${out}  ${size} MB  ${end.toFixed(0)} s  (${timed.map((video) => video.name || "page").join(" | ")})`)
}
console.log(`${made.length} GIFs in ${outDir}`)

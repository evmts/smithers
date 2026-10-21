#!/usr/bin/env node
// One reviewable video and one GIF preview per e2e flow, from the recordings the last Playwright run made.
//
//   node e2e/gifs.mjs [test-results] [gif-dir] [video-dir]
//
// Every test writes a manifest beside its recordings (flow.json or devices.json, e2e/fixtures.ts `writeManifest`) with
// what it did: its helpers' steps and the actions its pages saw. For each flow this lays its recordings side by side,
// each starting when its tab opened, at 10 fps, and writes:
//
// - <video-dir>/<spec>/<test>.mp4: H.264 at the recorded size. Blank page loads are cut and waits shortened
//   (e2e/frames.ts `plan`); a strip under the picture names the current step and shows the real run's clock.
// - <video-dir>/<spec>/<test>.chapters.json: the video's timeline, `[{ "t": seconds, "label": "step" }]`.
// - <gif-dir>/<flow>.gif: a preview of the same, at most 1000 px wide, shorter still, from a two-pass palette.
//
// Then it checks every video and GIF it wrote (e2e/check-gifs.mjs) and exits 1 when one fails.
import { chromium } from "@playwright/test"
import { execFileSync, spawn } from "node:child_process"
import { once } from "node:events"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { checkGif, checkVideo, measuredFrames } from "./check-gifs.mjs"
import { chapterAt, chaptersOf, combine, FPS, GIF_PACE, holdChapters, MAX_GIF_BYTES, MEASURE_HEIGHT, MEASURE_WIDTH, plan, retime, VIDEO_PACE } from "./frames.ts"

const results = process.argv[2] ?? "test-results"
const gifDir = process.argv[3] ?? join(homedir(), "Desktop/smithers-mvp/gifs")
const videoDir = process.argv[4] ?? join(homedir(), "Desktop/smithers-mvp/videos")
const GIF_WIDTH = 1000
const MAX_WIDTH = 1920
const GAP = 6
/** The caption strip under the picture, in pixels at the recorded size. */
const STRIP = 32
/** A device's name badge (e2e/devices.ts `label`) sits in this top-right box of its pane, in recorded pixels. */
const BADGE = { width: 200, height: 32 }

const probe = (file, entries) =>
  execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", entries, "-of", "csv=p=0", file]).toString().trim()

const exited = (child, what) =>
  new Promise((resolve, reject) =>
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${what}: ffmpeg exited ${code}`)))),
  )

/** An ffmpeg that reads raw rgb24 frames of `width`×`height` at FPS from its stdin, with backpressure. */
const encoder = (width, height, args, what) => {
  const child = spawn("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${width}x${height}`, "-framerate", String(FPS), "-i", "-", ...args], {
    stdio: ["pipe", "ignore", "inherit"],
  })
  child.stdin.on("error", () => undefined)
  const done = exited(child, what)
  return {
    write: async (frame) => {
      if (!child.stdin.write(frame)) await once(child.stdin, "drain")
    },
    end: async () => {
      child.stdin.end()
      await done
    },
  }
}

/** Every frame of `file` as raw rgb24, `bytes` long each. */
async function* rawFrames(file, bytes) {
  const decoder = spawn("ffmpeg", ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { stdio: ["ignore", "pipe", "inherit"] })
  const done = exited(decoder, `decode ${file}`)
  let frame = Buffer.allocUnsafe(bytes)
  let filled = 0
  for await (const chunk of decoder.stdout) {
    for (let offset = 0; offset < chunk.length; ) {
      const take = Math.min(bytes - filled, chunk.length - offset)
      chunk.copy(frame, filled, offset, offset + take)
      filled += take
      offset += take
      if (filled === bytes) {
        yield frame
        frame = Buffer.allocUnsafe(bytes)
        filled = 0
      }
    }
  }
  await done
}

/**
 * Each pane's box in the composed picture, as `compose` lays them out: scaled to the common height (an even width),
 * a GAP after each but the last, then the whole scaled down to MAX_WIDTH.
 */
const paneBoxes = (timed) => {
  const height = Math.max(...timed.map((video) => video.height))
  const widths = timed.map((video) => Math.round((height * video.width) / video.height / 2) * 2)
  const total = widths.reduce((sum, width) => sum + width, 0) + GAP * (timed.length - 1)
  const scale = Math.min(1, MAX_WIDTH / total)
  let x = 0
  return widths.map((width) => {
    const box = { x: Math.floor(x * scale), y: 0, width: Math.floor(width * scale), height: Math.floor(height * scale) }
    x += width + GAP
    return box
  })
}

/** Every composed frame measured pane by pane, each pane's badge left out: blank only when every pane is blank. */
const measurePanes = (composed, timed) => {
  const panes = paneBoxes(timed).map((box) =>
    measuredFrames(composed, box, {
      width: Math.round((BADGE.width / box.width) * MEASURE_WIDTH),
      height: Math.round((BADGE.height / box.height) * MEASURE_HEIGHT),
    }),
  )
  return panes[0].map((_, index) => combine(panes.map((frames) => frames[index] ?? frames.at(-1))))
}

/** Lays a flow's recordings side by side at a common height, each from when its tab opened, at FPS, losslessly. */
const compose = (timed, end, out) => {
  const height = Math.max(...timed.map((video) => video.height))
  const panes = timed.map((video, index) => {
    const last = index === timed.length - 1
    return (
      `[${index}:v]setpts=PTS-STARTPTS,scale=-2:${height}:flags=lanczos,` +
      `pad=iw+${last ? 0 : GAP}:${height}:0:0:color=0x1f2937,` +
      `tpad=start_duration=${video.openedAt.toFixed(3)}:start_mode=add:color=0xe5e7eb:` +
      `stop_duration=${Math.max(0, end - video.openedAt - video.duration).toFixed(3)}:stop_mode=clone[p${index}]`
    )
  })
  const stack = timed.length === 1 ? "[p0]null[s]" : `${timed.map((_, index) => `[p${index}]`).join("")}hstack=inputs=${timed.length}[s]`
  const even = `[s]fps=${FPS},scale='min(${MAX_WIDTH},iw)':-2:flags=lanczos,pad=ceil(iw/2)*2:ceil(ih/2)*2[v]`
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    ...timed.flatMap((video) => ["-i", video.video]),
    "-filter_complex",
    [...panes, stack, even].join(";"),
    "-map",
    "[v]",
    "-t",
    end.toFixed(3),
    "-c:v",
    "ffv1",
    "-pix_fmt",
    "gbrp",
    out,
  ])
}

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`

/**
 * Draws caption strips in Chromium, so they use a real font: the step's number and label on the left, the real run's
 * clock on the right, and "failed" when the test failed. Returns each as raw rgb24.
 */
const captions = async (page, width, items) => {
  const drawn = await page.evaluate(
    ([width, height, items]) =>
      items.map(({ step, label, time, failed }) => {
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext("2d")
        context.fillStyle = "#111827"
        context.fillRect(0, 0, width, height)
        context.textBaseline = "middle"
        const font = "600 15px -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
        context.font = font
        let right = width - 12
        if (failed) {
          context.fillStyle = "#f87171"
          context.textAlign = "right"
          context.fillText("failed", right, height / 2)
          right -= context.measureText("failed").width + 14
        }
        context.fillStyle = "#9ca3af"
        context.textAlign = "right"
        context.font = `500 14px ui-monospace, Menlo, monospace`
        context.fillText(time, right, height / 2)
        right -= context.measureText(time).width + 20
        context.textAlign = "left"
        let left = 12
        if (step !== "") {
          context.fillStyle = "#9ca3af"
          context.font = font
          context.fillText(step, left, height / 2)
          left += context.measureText(step).width + 10
        }
        context.fillStyle = "#f9fafb"
        context.font = font
        let text = label
        while (text.length > 1 && left + context.measureText(text).width > right) text = `${text.slice(0, -2)}…`
        context.fillText(text, left, height / 2)
        const rgba = context.getImageData(0, 0, width, height).data
        let binary = ""
        for (let index = 0; index < rgba.length; index += 4) binary += String.fromCharCode(rgba[index], rgba[index + 1], rgba[index + 2])
        return btoa(binary)
      }),
    [width, STRIP, items],
  )
  return drawn.map((base64) => Buffer.from(base64, "base64"))
}

const readManifests = () => {
  // devices.json wins over flow.json in the same directory: a devices test has no default page.
  const manifests = readdirSync(results, { recursive: true })
    .map(String)
    .filter((path) => path.endsWith("devices.json") || path.endsWith("flow.json"))
  const byDir = new Map()
  for (const path of manifests) {
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "."
    if (byDir.has(dir) && path.endsWith("flow.json")) continue
    const flow = JSON.parse(readFileSync(join(results, path), "utf8"))
    // A relative video path is beside its manifest.
    for (const video of flow.videos) if (video.video && !video.video.startsWith("/")) video.video = join(results, dir, video.video)
    byDir.set(dir, flow)
  }
  return [...byDir.values()].sort((left, right) => left.flow.localeCompare(right.flow))
}

const make = async (flow, page, alike) => {
  const videos = flow.videos.filter((video) => video.video && existsSync(video.video) && statSync(video.video).size > 0)
  if (videos.length === 0) return console.log(`skipped  ${flow.flow}: no video`)
  const timed = videos.map((video) => {
    const [width, height] = probe(video.video, "stream=width,height").split(",").map(Number)
    return { ...video, width, height, duration: Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video.video]).toString().trim()) }
  })
  const end = Math.max(...timed.map((video) => video.openedAt + video.duration))
  const work = mkdtempSync(join(tmpdir(), "e2e-media-"))
  try {
    const composed = join(work, "composed.mkv")
    compose(timed, end, composed)
    const [width, height] = probe(composed, "stream=width,height").split(",").map(Number)
    const frames = measurePanes(composed, timed)
    // An older manifest has neither `startedAt` nor `marks`: its video has no chapters, and the check fails it.
    const found = chaptersOf(flow.marks ?? [], flow.startedAt ?? 0)
    const videoRepeat = holdChapters(plan(frames, VIDEO_PACE), frames, found, VIDEO_PACE.chapter)
    const gifRepeat = holdChapters(plan(frames, GIF_PACE), frames, found, GIF_PACE.chapter)
    if (!videoRepeat.some((count) => count > 0)) throw new Error(`${flow.flow}: every frame is blank`)
    // Tests whose titles start alike (flows.spec.ts' "flows: …") are named by their whole titles instead.
    const spec = flow.spec ?? "flows"
    const whole = slug(flow.title).slice(0, 60)
    const [name, gifName] = alike ? [whole, `${spec}-${whole}`] : [flow.test ?? flow.flow, flow.flow]
    mkdirSync(join(videoDir, spec), { recursive: true })
    const mp4 = join(videoDir, spec, `${name}.mp4`)
    const chaptersFile = join(videoDir, spec, `${name}.chapters.json`)
    const gif = join(gifDir, `${gifName}.gif`)

    // One caption per chapter and second of the real run, drawn once.
    const total = clock(end)
    const keyOf = (index) => `${chapterAt(found, index)}:${Math.floor(index / FPS)}`
    const needed = new Map()
    for (let index = 0; index < frames.length; index++) {
      if (videoRepeat[index] === 0 && gifRepeat[index] === 0) continue
      const key = keyOf(index)
      if (needed.has(key)) continue
      const chapter = chapterAt(found, index)
      needed.set(key, {
        step: chapter < 0 ? "" : `${chapter + 1}/${found.length}`,
        label: chapter < 0 ? flow.title : found[chapter].label,
        time: `${clock(index / FPS)} / ${total}`,
        failed: flow.status !== undefined && flow.status !== "passed",
      })
    }
    const keys = [...needed.keys()]
    const strips = new Map((await captions(page, width, [...needed.values()])).map((strip, index) => [keys[index], strip]))

    const tall = height + STRIP
    const video = encoder(width, tall, ["-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], mp4)
    const preview = join(work, "preview.mkv")
    const gifFrames = encoder(width, tall, ["-vf", `scale='min(${GIF_WIDTH},iw)':-2:flags=lanczos`, "-c:v", "ffv1", "-pix_fmt", "gbrp", preview], preview)
    let index = 0
    for await (const frame of rawFrames(composed, width * height * 3)) {
      if (videoRepeat[index] > 0 || gifRepeat[index] > 0) {
        const out = Buffer.allocUnsafe(width * tall * 3)
        frame.copy(out, 0)
        strips.get(keyOf(index)).copy(out, width * height * 3)
        for (let copy = 0; copy < videoRepeat[index]; copy++) await video.write(out)
        for (let copy = 0; copy < gifRepeat[index]; copy++) await gifFrames.write(out)
      }
      index++
    }
    await Promise.all([video.end(), gifFrames.end()])
    writeFileSync(chaptersFile, `${JSON.stringify(retime(found, videoRepeat), null, 2)}\n`)

    // A two-pass palette: one palette from every frame, then each frame mapped onto it with a stable ordered dither.
    const palette = join(work, "palette.png")
    for (const colors of [128, 64]) {
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", preview, "-vf", `palettegen=max_colors=${colors}:stats_mode=full`, palette])
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", preview, "-i", palette, "-lavfi", "paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle", gif])
      if (statSync(gif).size <= MAX_GIF_BYTES) break
    }
    const seconds = (repeat) => (repeat.reduce((sum, count) => sum + count, 0) / FPS).toFixed(0)
    const mb = (file) => (statSync(file).size / 1024 / 1024).toFixed(1)
    console.log(`${String(flow.status).padEnd(8)} ${flow.flow}  (${timed.map((video) => video.name || "page").join(" | ")})`)
    console.log(`         ${mp4}  ${mb(mp4)} MB  ${seconds(videoRepeat)} s of ${end.toFixed(0)} s  ${found.length} chapters`)
    console.log(`         ${gif}  ${mb(gif)} MB  ${seconds(gifRepeat)} s`)
    return { gif, mp4 }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

mkdirSync(gifDir, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage()
const made = []
let failed = 0
try {
  const flows = readManifests()
  const key = (flow) => `${flow.spec}/${flow.test ?? flow.flow}`
  for (const flow of flows) {
    try {
      const media = await make(flow, page, flows.filter((other) => key(other) === key(flow)).length > 1)
      if (media !== undefined) made.push(media)
    } catch (error) {
      failed++
      console.error(`FAILED   ${flow.flow}: ${error.message}`)
    }
  }
} finally {
  await browser.close()
}
const bad = made
  .flatMap(({ gif, mp4 }) => [
    [gif, checkGif(gif)],
    [mp4, checkVideo(mp4)],
  ])
  .filter(([, found]) => found.length > 0)
for (const [file, found] of bad) console.error(`BAD      ${file}  ${found.join("; ")}`)
console.log(`${made.length} videos and GIFs; ${bad.length} fail the check; ${failed} flows failed to build`)
if (bad.length > 0 || failed > 0) process.exit(1)

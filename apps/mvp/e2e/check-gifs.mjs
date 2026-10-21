#!/usr/bin/env node
// Fails on a flow GIF nobody can review: blank frames, a frozen stretch, a frame that flashes for 0.1 s, or a file
// too big to open (e2e/frames.ts `problems`); and on a flow video longer than 5 s with fewer than 2 chapters in its
// <name>.chapters.json (`videoProblems`). e2e/gifs.mjs checks every one it writes; run this on any others:
//
//   node e2e/check-gifs.mjs [file-or-dir ...]     (default: ~/Desktop/smithers-mvp/gifs and videos, every subfolder)
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { changedBetween, FPS, measure, MEASURE_HEIGHT, MEASURE_WIDTH, problems, videoProblems } from "./frames.ts"

const SIZE = MEASURE_WIDTH * MEASURE_HEIGHT

/**
 * Every frame of a video or GIF at FPS, small and gray, each measured against the frame before it: the whole picture,
 * or the `crop` box of it (`{ x, y, width, height }` in its pixels), leaving `corner` out of detail (frames.ts `measure`).
 */
export const measuredFrames = (file, crop, corner) => {
  const box = crop === undefined ? "" : `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},`
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-vf", `fps=${FPS},${box}scale=${MEASURE_WIDTH}:${MEASURE_HEIGHT}:flags=area,format=gray`, "-f", "rawvideo", "-"],
    { maxBuffer: 2 ** 31 },
  )
  const gray = Array.from({ length: raw.length / SIZE }, (_, index) => raw.subarray(index * SIZE, (index + 1) * SIZE))
  return gray.map((frame, index) => ({
    ...measure(frame, gray[index - 1], corner),
    // A flash differs from both neighbors while they match each other.
    skip: index > 0 && index < gray.length - 1 ? changedBetween(gray[index + 1], gray[index - 1]) : 0,
  }))
}

/** What is wrong with one GIF: empty when it is fine to review. */
export const checkGif = (file) => problems(measuredFrames(file), statSync(file).size)

/** What is wrong with one video: its chapters, beside it as <name>.chapters.json. */
export const checkVideo = (file) => {
  const chaptersFile = file.replace(/\.mp4$/, ".chapters.json")
  const chapters = existsSync(chaptersFile) ? JSON.parse(readFileSync(chaptersFile, "utf8")) : []
  let seconds
  try {
    seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { stdio: "pipe" }).toString().trim())
  } catch {
    return ["unreadable: no playable video (still being written?)"]
  }
  return videoProblems(seconds, chapters.length)
}

const mediaUnder = (path) =>
  !existsSync(path)
    ? []
    : statSync(path).isDirectory()
      ? readdirSync(path, { recursive: true })
          .map(String)
          .filter((name) => name.endsWith(".gif") || name.endsWith(".mp4"))
          .sort()
          .map((name) => join(path, name))
      : [path]

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = process.argv.length > 2 ? process.argv.slice(2) : ["gifs", "videos"].map((dir) => join(homedir(), "Desktop/smithers-mvp", dir))
  let bad = 0
  for (const file of paths.flatMap(mediaUnder)) {
    const found = file.endsWith(".mp4") ? checkVideo(file) : checkGif(file)
    if (found.length > 0) bad++
    console.log(`${found.length === 0 ? "ok  " : "BAD "} ${file}${found.length === 0 ? "" : `  ${found.join("; ")}`}`)
  }
  if (bad > 0) {
    console.error(`${bad} GIFs and videos fail the check`)
    process.exit(1)
  }
}

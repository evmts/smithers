#!/usr/bin/env bun
/**
 * Create a Windows ICO file from PNG images
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(__dirname, '..', 'src-tauri', 'icons')

// Read PNG files
const png32 = readFileSync(join(iconsDir, '32x32.png'))
const png128 = readFileSync(join(iconsDir, '128x128.png'))

// ICO file format:
// - Header (6 bytes)
// - Image directory entries (16 bytes each)
// - Image data (PNG or BMP)

function createICO(pngFiles: { data: Buffer, size: number }[]): Buffer {
  const numImages = pngFiles.length
  const headerSize = 6
  const dirEntrySize = 16
  const dirSize = numImages * dirEntrySize

  // Calculate offsets
  let offset = headerSize + dirSize
  const offsets = pngFiles.map((png) => {
    const currentOffset = offset
    offset += png.data.length
    return currentOffset
  })

  // ICO Header
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)         // Reserved
  header.writeUInt16LE(1, 2)         // Image type: 1 = ICO
  header.writeUInt16LE(numImages, 4) // Number of images

  // Directory entries
  const entries = pngFiles.map((png, i) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(png.size === 256 ? 0 : png.size, 0)  // Width (0 means 256)
    entry.writeUInt8(png.size === 256 ? 0 : png.size, 1)  // Height (0 means 256)
    entry.writeUInt8(0, 2)                                  // Color palette
    entry.writeUInt8(0, 3)                                  // Reserved
    entry.writeUInt16LE(1, 4)                               // Color planes
    entry.writeUInt16LE(32, 6)                              // Bits per pixel
    entry.writeUInt32LE(png.data.length, 8)                 // Size of image data
    entry.writeUInt32LE(offsets[i], 12)                     // Offset to image data
    return entry
  })

  // Combine all parts
  return Buffer.concat([header, ...entries, ...pngFiles.map(p => p.data)])
}

const ico = createICO([
  { data: png32, size: 32 },
  { data: png128, size: 128 },
])

writeFileSync(join(iconsDir, 'icon.ico'), ico)
console.log('Created icon.ico')

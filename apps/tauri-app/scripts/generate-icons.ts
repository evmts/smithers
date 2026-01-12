#!/usr/bin/env bun
/**
 * Generate placeholder icons for Tauri app
 * Uses a simple canvas-based approach
 */

import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(__dirname, '..', 'src-tauri', 'icons')

// Create a simple PNG with a colored rectangle (placeholder)
// This is a minimal valid PNG structure
function createPlaceholderPNG(size: number, color: { r: number, g: number, b: number }): Buffer {
  // For now, we'll create a simple solid color PNG
  // PNG structure: signature + IHDR + IDAT + IEND

  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

  // IHDR chunk
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(size, 0)  // width
  ihdrData.writeUInt32BE(size, 4)  // height
  ihdrData.writeUInt8(8, 8)        // bit depth
  ihdrData.writeUInt8(2, 9)        // color type (RGB)
  ihdrData.writeUInt8(0, 10)       // compression
  ihdrData.writeUInt8(0, 11)       // filter
  ihdrData.writeUInt8(0, 12)       // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData)

  // Create raw image data (RGB, one row at a time with filter byte)
  const rawData: number[] = []
  for (let y = 0; y < size; y++) {
    rawData.push(0) // filter byte
    for (let x = 0; x < size; x++) {
      // Create a gradient S logo pattern
      const centerX = size / 2
      const centerY = size / 2
      const radius = size * 0.4
      const distFromCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)

      if (distFromCenter < radius) {
        // Inside the circle - purple color for Smithers
        rawData.push(0x6B, 0x21, 0xA8) // Purple
      } else {
        // Background - dark
        rawData.push(0x1F, 0x20, 0x37) // Dark blue
      }
    }
  }

  // Compress with zlib
  const Bun = globalThis.Bun
  const compressed = Bun.deflateSync(new Uint8Array(rawData))

  const idatChunk = createChunk('IDAT', Buffer.from(compressed))

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

function createChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const typeBuffer = Buffer.from(type)
  const crc = crc32(Buffer.concat([typeBuffer, data]))
  const crcBuffer = Buffer.alloc(4)
  crcBuffer.writeUInt32BE(crc, 0)

  return Buffer.concat([length, typeBuffer, data, crcBuffer])
}

// Simple CRC32 implementation
function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF
  const table = makeCRCTable()

  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF]
  }

  return (crc ^ 0xFFFFFFFF) >>> 0
}

function makeCRCTable(): number[] {
  const table: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
}

// Generate icons
console.log('Generating Tauri app icons...')

const sizes = [32, 128, 256]
const color = { r: 0x6B, g: 0x21, b: 0xA8 } // Purple

for (const size of sizes) {
  const png = createPlaceholderPNG(size, color)
  const filename = size === 256 ? '128x128@2x.png' : `${size}x${size}.png`
  writeFileSync(join(iconsDir, filename), png)
  console.log(`  Created ${filename}`)
}

// For macOS .icns and Windows .ico, we need to create proper files
// For now, create a simple note that these need to be generated

console.log('\nNote: icon.icns and icon.ico need to be generated from the PNG files.')
console.log('On macOS, use: iconutil -c icns <iconset>')
console.log('Or use a tool like cargo-tauri to generate all icons from a single PNG.')

console.log('\nDone!')

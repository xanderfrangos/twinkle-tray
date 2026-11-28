// Dev-only: renders the value tray icons to PNGs so they can be eyeballed.
// Usage: node scripts/render-tray-preview.js [output directory]
//
// The icons are 16px, so the PNGs are written 8x larger with nearest-neighbour
// scaling to make the pixels visible.

const fs = require("fs")
const path = require("path")
const zlib = require("zlib")
const { renderIcon, SCALES } = require("../src/tray-icons")

const ZOOM = 8

function crc32(buffer) {
    let crc = 0xFFFFFFFF
    for (const byte of buffer) {
        crc ^= byte
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc & 1 ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1)
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0
}

function chunk(type, data) {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, "ascii"), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
}

// BGRA pixels -> RGBA PNG, scaled up with nearest-neighbour and composited on
// a taskbar-coloured background so the glyphs are visible in a viewer.
function toPng({ buffer, width, height }, background) {
    const zoom = ZOOM
    const raw = Buffer.alloc((width * zoom * 4 + 1) * height * zoom)
    let offset = 0

    for (let y = 0; y < height * zoom; y++) {
        raw[offset++] = 0 // no filter
        const sourceY = Math.floor(y / zoom)
        for (let x = 0; x < width * zoom; x++) {
            const sourceX = Math.floor(x / zoom)
            const pixel = ((sourceY * width) + sourceX) * 4
            const alpha = buffer[pixel + 3] / 255
            raw[offset++] = Math.round((buffer[pixel + 2] * alpha) + (background[0] * (1 - alpha)))
            raw[offset++] = Math.round((buffer[pixel + 1] * alpha) + (background[1] * (1 - alpha)))
            raw[offset++] = Math.round((buffer[pixel] * alpha) + (background[2] * (1 - alpha)))
            raw[offset++] = 255
        }
    }

    const header = Buffer.alloc(13)
    header.writeUInt32BE(width * zoom, 0)
    header.writeUInt32BE(height * zoom, 4)
    header[8] = 8  // bit depth
    header[9] = 6  // RGBA

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        chunk("IHDR", header),
        chunk("IDAT", zlib.deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0))
    ])
}

const outputDir = path.resolve(process.argv[2] || path.join(__dirname, "..", ".tray-preview"))
fs.mkdirSync(outputDir, { recursive: true })

const cases = [
    { value: 62, label: "B", theme: "dark" },
    { value: 45, label: "C", theme: "dark" },
    { value: 62, label: "B", theme: "light" },
    { value: 100, label: "B", theme: "dark" },
    { value: 0, label: "C", theme: "dark" },
    { value: null, label: "B", theme: "dark" }
]

const DARK_TASKBAR = [32, 32, 32]
const LIGHT_TASKBAR = [243, 243, 243]

for (const scale of SCALES) {
    for (const item of cases) {
        const name = `${item.label || "x"}-${item.value ?? "na"}-${item.theme}-${scale}x.png`
        const background = (item.theme === "light" ? LIGHT_TASKBAR : DARK_TASKBAR)
        fs.writeFileSync(path.join(outputDir, name), toPng(renderIcon({ ...item, scale }), background))
    }
}

console.log(`Wrote ${cases.length * SCALES.length} previews to ${outputDir}`)

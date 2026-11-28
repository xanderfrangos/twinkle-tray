// Draws the tray icons that show a display's value, like ClickMonitorDDC did.
// A 3x5 bitmap font is used because a tray icon is only 16 pixels tall, and the
// glyphs are scaled by whole numbers so they stay sharp at any DPI.
//
// Everything here is pure so it can be tested and previewed without Electron.

const GLYPH_WIDTH = 3
const GLYPH_HEIGHT = 5

const GLYPHS = {
    "0": ["111", "101", "101", "101", "111"],
    "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"],
    "3": ["111", "001", "111", "001", "111"],
    "4": ["101", "101", "111", "001", "001"],
    "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"],
    "7": ["111", "001", "001", "001", "001"],
    "8": ["111", "101", "111", "101", "111"],
    "9": ["111", "101", "111", "001", "111"],
    "-": ["000", "000", "111", "000", "000"],
    "B": ["110", "101", "110", "101", "110"],
    "C": ["111", "100", "100", "100", "111"]
}

// Tray icons are 16 pixels tall at 100% and Windows scales them with the DPI.
const SCALES = [1, 1.5, 2]

// Values are percentages. Anything the app can't read shows as dashes.
function formatValue(value) {
    if (value === null || value === undefined || value === "") return "--"
    const number = Number(value)
    if (!Number.isFinite(number)) return "--"
    return String(Math.min(100, Math.max(0, Math.round(number))))
}

function measure(text, size, gap) {
    const length = text.length
    return length * GLYPH_WIDTH * size + (length - 1) * gap
}

// Pick the largest glyph size that still fits the canvas next to the label.
function fitLayout(text, wantsLabel, canvas, scale) {
    const gap = Math.max(1, Math.round(scale))
    const labelSize = Math.max(1, Math.round(scale))
    const labelWidth = (wantsLabel ? GLYPH_WIDTH * labelSize : 0)
    let size = Math.max(1, Math.round(2 * scale))

    while (size > 1 && measure(text, size, gap) + labelWidth > canvas) size--

    return {
        size,
        gap,
        labelSize,
        labelWidth,
        textWidth: measure(text, size, gap)
    }
}

function drawGlyph(pixels, canvas, char, x, y, size, color) {
    const glyph = GLYPHS[char]
    if (!glyph) return

    for (let row = 0; row < GLYPH_HEIGHT; row++) {
        for (let column = 0; column < GLYPH_WIDTH; column++) {
            if (glyph[row][column] !== "1") continue
            const startX = x + (column * size)
            const startY = y + (row * size)
            for (let dy = 0; dy < size; dy++) {
                for (let dx = 0; dx < size; dx++) {
                    const px = startX + dx
                    const py = startY + dy
                    if (px < 0 || py < 0 || px >= canvas || py >= canvas) continue
                    const offset = ((py * canvas) + px) * 4
                    // BGRA, premultiplied so a transparent pixel has no colour
                    pixels[offset] = color.blue
                    pixels[offset + 1] = color.green
                    pixels[offset + 2] = color.red
                    pixels[offset + 3] = 255
                }
            }
        }
    }
}

// scale: 1, 1.5 or 2. theme: "light" (light taskbar, dark glyph) or "dark".
// Returns a BGRA buffer for nativeImage.createFromBitmap().
function renderIcon({ value, label = "", theme = "dark", scale = 1 } = {}) {
    const canvas = Math.round(16 * scale)
    const text = formatValue(value)
    // Three digits leave no room for the label, so it is dropped for 100%.
    const wantsLabel = !!label && text.length <= 2
    const { size, gap, labelSize, labelWidth, textWidth } = fitLayout(text, wantsLabel, canvas, scale)

    const pixels = Buffer.alloc(canvas * canvas * 4)
    const color = (theme === "light"
        ? { red: 0, green: 0, blue: 0 }
        : { red: 255, green: 255, blue: 255 })

    const totalWidth = textWidth + labelWidth
    const x0 = Math.round((canvas - totalWidth) / 2)
    const textY = Math.round((canvas - (GLYPH_HEIGHT * size)) / 2)

    if (wantsLabel) {
        const labelY = Math.round((canvas - (GLYPH_HEIGHT * labelSize)) / 2)
        drawGlyph(pixels, canvas, label, x0, labelY, labelSize, color)
    }

    let x = x0 + labelWidth
    for (const char of text) {
        drawGlyph(pixels, canvas, char, x, textY, size, color)
        x += (GLYPH_WIDTH * size) + gap
    }

    return { buffer: pixels, width: canvas, height: canvas }
}

module.exports = {
    formatValue,
    renderIcon,
    SCALES
}

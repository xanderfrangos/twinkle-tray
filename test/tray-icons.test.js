const test = require("node:test")
const assert = require("node:assert")
const { formatValue, renderIcon, SCALES } = require("../src/tray-icons")

test("formatValue clamps and rounds percentages", () => {
    assert.equal(formatValue(62.4), "62")
    assert.equal(formatValue(62.6), "63")
    assert.equal(formatValue(-4), "0")
    assert.equal(formatValue(140), "100")
    assert.equal(formatValue("45"), "45")
})

test("formatValue shows dashes when the value is unreadable", () => {
    assert.equal(formatValue(undefined), "--")
    assert.equal(formatValue(null), "--")
    assert.equal(formatValue(NaN), "--")
    assert.equal(formatValue("nope"), "--")
})

test("renderIcon returns a BGRA buffer sized for each scale", () => {
    for (const scale of SCALES) {
        const icon = renderIcon({ value: 62, label: "B", theme: "dark", scale })
        const size = Math.round(16 * scale)

        assert.equal(icon.width, size)
        assert.equal(icon.height, size)
        assert.equal(icon.buffer.length, size * size * 4)
    }
})

test("renderIcon draws white glyphs on a dark taskbar and black on a light one", () => {
    const dark = renderIcon({ value: 62, label: "B", theme: "dark", scale: 1 })
    const light = renderIcon({ value: 62, label: "B", theme: "light", scale: 1 })

    const paintedPixels = icon => {
        const pixels = []
        for (let offset = 0; offset < icon.buffer.length; offset += 4) {
            if (icon.buffer[offset + 3] === 0) continue
            pixels.push([icon.buffer[offset], icon.buffer[offset + 1], icon.buffer[offset + 2]])
        }
        return pixels
    }

    const darkPixels = paintedPixels(dark)
    const lightPixels = paintedPixels(light)

    assert.ok(darkPixels.length > 0)
    assert.equal(darkPixels.length, lightPixels.length)
    // BGRA, so all three channels carry the glyph colour
    assert.deepEqual(darkPixels[0], [255, 255, 255])
    assert.deepEqual(lightPixels[0], [0, 0, 0])
})

test("renderIcon keeps transparent pixels fully clear", () => {
    const icon = renderIcon({ value: 50, label: "C", theme: "dark", scale: 1 })
    // The top right corner is always empty for a two digit value
    const corner = ((0 * icon.width) + (icon.width - 1)) * 4

    assert.equal(icon.buffer[corner + 3], 0)
    assert.equal(icon.buffer[corner], 0)
})

test("renderIcon drops the label for three digit values", () => {
    const withLabel = renderIcon({ value: 62, label: "B", theme: "dark", scale: 1 })
    const withoutLabel = renderIcon({ value: 62, label: "", theme: "dark", scale: 1 })
    const threeDigits = renderIcon({ value: 100, label: "B", theme: "dark", scale: 1 })
    const threeDigitsNoLabel = renderIcon({ value: 100, label: "", theme: "dark", scale: 1 })

    const litPixels = icon => {
        let count = 0
        for (let offset = 3; offset < icon.buffer.length; offset += 4) {
            if (icon.buffer[offset] !== 0) count++
        }
        return count
    }

    // The label occupies pixels the unlabelled icon leaves clear
    assert.ok(litPixels(withLabel) > litPixels(withoutLabel))
    // Three digits fill the icon, so the label gives way: same pixels either way
    assert.deepEqual(threeDigits.buffer, threeDigitsNoLabel.buffer)
})

test("renderIcon keeps three digit values inside the icon", () => {
    const icon = renderIcon({ value: 100, label: "B", theme: "dark", scale: 1 })
    let lit = 0

    for (let y = 0; y < icon.height; y++) {
        for (let x = 0; x < icon.width; x++) {
            const alpha = icon.buffer[(((y * icon.width) + x) * 4) + 3]
            if (alpha !== 0) lit++
        }
    }

    // 32 glyph cells at the smallest size, so nothing is clipped away
    assert.equal(lit, 32)
})

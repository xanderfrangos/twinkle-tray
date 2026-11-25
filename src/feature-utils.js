// Contrast and custom VCP sliders convert at the UI boundary, like volume:
// feature tuples hold raw DDC values, sliders work in percent, and a
// feature's Min/Max settings are percentages of the display's maximum.

function getFeatureMaximum(feature) {
    const reportedMaximum = Number(feature?.[1])
    return (Number.isFinite(reportedMaximum) && reportedMaximum > 0 ? reportedMaximum : 100)
}

// The raw values at the slider's two ends. Min rounds up and Max rounds
// down, so the slider never sends a value outside them (a Min above 0 never
// sends 0).
function getFeatureRawRange(feature, settings = {}) {
    let min = Number(settings?.min ?? 0)
    let max = Number(settings?.max ?? 100)
    if (!(Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max <= 100 && min <= max)) {
        min = 0
        max = 100
    }
    const maximum = getFeatureMaximum(feature)
    const low = Math.min(maximum, Math.ceil(min * maximum / 100))
    const high = Math.max(low, Math.floor(max * maximum / 100))
    return [low, high]
}

function scaleFeature(value, feature, settings = {}) {
    const [low, high] = getFeatureRawRange(feature, settings)
    const percent = Math.max(0, Math.min(100, Number(value)))
    return Math.round(low + percent * (high - low) / 100)
}

function unscaleFeature(value, feature, settings = {}) {
    const [low, high] = getFeatureRawRange(feature, settings)
    const raw = Number(value)
    if (high === low || !Number.isFinite(raw)) return 0
    return Math.max(0, Math.min(100, (raw - low) * 100 / (high - low)))
}

module.exports = {
    getFeatureRawRange,
    scaleFeature,
    unscaleFeature
}

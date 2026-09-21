function getVolumeMaximum(feature, settings = {}) {
    const override = Number(settings?.maxRawValue)
    if (Number.isInteger(override) && override >= 1 && override <= 0xFFFF) {
        return override
    }

    const reportedMaximum = Number(feature?.[1])
    return (Number.isFinite(reportedMaximum) && reportedMaximum > 0 ? reportedMaximum : 100)
}

// Volume sliders convert at the UI boundary; feature tuples remain raw DDC values.
function getVolumeRange(settings) {
    const min = Number(settings?.min ?? 0)
    const max = Number(settings?.max ?? 100)
    return (Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max <= 100 && min <= max)
        ? [min, max] : [0, 100]
}

function scaleVolume(value, feature, settings = {}) {
    const [min, max] = getVolumeRange(settings)
    const percent = Math.max(0, Math.min(100, Number(value)))
    return Math.round((min + percent * (max - min) / 100) * getVolumeMaximum(feature, settings) / 100)
}

function unscaleVolume(value, feature, settings = {}) {
    const [min, max] = getVolumeRange(settings)
    if (min === max) return 0
    const percent = Number(value) * 100 / getVolumeMaximum(feature, settings)
    return Math.max(0, Math.min(100, (percent - min) * 100 / (max - min)))
}

module.exports = {
    getVolumeMaximum,
    scaleVolume,
    unscaleVolume
}

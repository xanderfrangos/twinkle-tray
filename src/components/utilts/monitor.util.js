export function getMonitorName(monitor, renames) {
    if (Object.keys(renames).indexOf(monitor.id) >= 0 && renames[monitor.id] != "") {
        return renames[monitor.id] + ` (${monitor.name})`
    } else {
        return monitor.name
    }
}

// Normalization, calibration and read-back ramps can all produce fractional
// levels. Users only ever see whole numbers. Anything that isn't a number
// (like a placeholder) is shown as is.
export function displayLevel(value) {
    const number = Number(value)
    return (value !== "" && value !== null && Number.isFinite(number) ? Math.round(number) : value)
}

// Per-display opt-in: the primary slider drives the display's gamma ramp
// instead of the brightness control that was detected for it.
export function usesGammaSlider(monitor) {
    if (!window.settings?.gammaAsMainSliderDisplays?.[monitor?.key]) return false
    if (monitor?.hdr === "active") return false // Mirrors canUseGammaRamp() in electron.js
    return (monitor?.gammaBrightness >= 0)
}

// Displays without a detected brightness control are typed "none", but the
// gamma slider still gives them a primary slider.
export function isAdjustableDisplay(monitor) {
    return (monitor?.type !== "none" || usesGammaSlider(monitor))
}

export function getMonitorName(monitor, renames) {
    if (Object.keys(renames).indexOf(monitor.id) >= 0 && renames[monitor.id] != "") {
        return renames[monitor.id] + ` (${monitor.name})`
    } else {
        return monitor.name
    }
}

// Per-display opt-in: the primary slider drives the display's gamma ramp
// instead of the brightness control that was detected for it.
export function usesGammaSlider(monitor) {
    if (!window.settings?.gammaAsMainSliderDisplays?.[monitor?.key]) return false
    return (monitor?.gammaBrightness >= 0)
}

// Displays without a detected brightness control are typed "none", but the
// gamma slider still gives them a primary slider.
export function isAdjustableDisplay(monitor) {
    return (monitor?.type !== "none" || usesGammaSlider(monitor))
}

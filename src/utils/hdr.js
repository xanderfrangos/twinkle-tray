// Report known Windows HDR states only. Missing data and unsupported displays
// must not be mistaken for HDR-capable displays with HDR switched off.
function getHDRStatus(monitors) {
    const states = monitors
        .filter(monitor => monitor?.hdr === "active" || monitor?.hdr === "supported")
        .map(monitor => monitor.hdr === "active")
    if (!states.length) return null
    if (states.every(Boolean)) return "ON"
    if (states.some(Boolean)) return "MIXED"
    return "OFF"
}

module.exports = { getHDRStatus }

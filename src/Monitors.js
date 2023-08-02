console.log("\x1b[45mMonitor.js starting. If you see this more than once, something bad happened.\x1b[0m")
const w32disp = require("win32-displayconfig");
const wmibridge = require("wmi-bridge");
const { exec } = require('child_process');
require("os").setPriority(0, require("os").constants.priority.PRIORITY_BELOW_NORMAL)


process.on('message', (data) => {
    try {
        if (data.type === "refreshMonitors") {
            refreshMonitors(data.fullRefresh, data.ddcciType).then((results) => {
                process.send({
                    type: 'refreshMonitors',
                    monitors: results
                })
            })
        } else if (data.type === "brightness") {
            setBrightness(data.brightness, data.id)
        } else if (data.type === "settings") {
            settings = data.settings

            // Overrides
            if (settings?.disableWMIC) wmicUnavailable = true;
            if (settings?.disableWMI) wmiFailed = true;
            if (settings?.disableWin32) win32Failed = true;

        } else if (data.type === "ddcBrightnessVCPs") {
            ddcBrightnessVCPs = data.ddcBrightnessVCPs
        } else if (data.type === "localization") {
            localization = data.localization
        } else if (data.type === "vcp") {
            setVCP(data.monitor, data.code, data.value)
        } else if (data.type === "flushvcp") {
            vcpCache = [];
        } else if (data.type === "wmi-bridge-ok") {
            canUseWmiBridge = true
        } else if (data.type === "getVCP") {
            getDDCCI()
            const vcp = checkVCP(data.monitor, data.code)
            process.send({
                type: `getVCP::${data.monitor}::${data.code}`,
                monitor: data.monitor,
                code: data.code,
                value: vcp?.[0]
            })
        }
    } catch (e) {
        console.log(e)
    }
})

let debug = console

let isDev = (process.argv.indexOf("--isdev=true") >= 0)

let monitors = false
let monitorNames = []
let monitorsWin32 = {}

let settings = { order: [] }
let localization = {}
let canUseWmiBridge = false

let ddcBrightnessVCPs = {}

let busyLevel = 0
refreshMonitors = async (fullRefresh = false, ddcciType = "default", alwaysSendUpdate = false) => {
    try {
        if ((busyLevel > 0 && !fullRefresh) || (busyLevel > 0 && fullRefresh)) {
            console.log("Thread busy. Cancelling refresh.")
            return false
        }
        busyLevel = (fullRefresh ? 2 : 1)

        if (!monitors || fullRefresh) {
            const foundMonitors = await getAllMonitors()
            monitors = foundMonitors
        } else {
            let startTime = process.hrtime()

            // DDC/CI
            try {
                if (settings?.getDDCBrightnessUpdates) {
                    getDDCCI()
                    ddcci._refresh()
                    for (const hwid2 in monitors) {
                        if (monitors[hwid2].type === "ddcci" && monitors[hwid2].brightnessType) {
                            const monitor = await getBrightnessDDC(monitors[hwid2])
                            monitors[hwid2] = monitor
                        }
                    }
                    console.log(`Refresh DDC/CI Brightness Total: ${process.hrtime(startTime)[1] / 1000000}ms`)
                }
            } catch (e) {
                console.log("Failed to refresh DDC/CI Brightness", e)
            }

            // WMIC (Windows 10)
            if (!wmicUnavailable) {
                try {
                    startTime = process.hrtime.bigint()
                    const wmiBrightness = await getBrightnessWMIC()
                    console.log(`getBrightnessWMIC() Total: ${(startTime - process.hrtime.bigint()) / BigInt(-1000000)}ms`)

                    if (wmiBrightness) {
                        updateDisplay(monitors, wmiBrightness.hwid[2], wmiBrightness)

                        // If Win32 doesn't find the internal display, hide it.
                        if (settings?.hideClosedLid && Object.keys(monitorsWin32).indexOf(wmiBrightness.hwid[2]) < 0) {
                            updateDisplay(monitors, wmiBrightness.hwid[2], { type: "none" })
                        }
                    }
                } catch (e) {
                    console.log("\x1b[41m" + "getBrightnessWMIC() failed!" + "\x1b[0m", e)
                }
            }

            // WMI
            if (canUseWmiBridge && !wmiFailed && wmicUnavailable) {
                try {
                    const wmiBrightness = await getBrightnessWMI()
                    if (wmiBrightness) {
                        updateDisplay(monitors, wmiBrightness.hwid[2], wmiBrightness)

                        // If Win32 doesn't find the internal display, hide it.
                        if (settings?.hideClosedLid && Object.keys(monitorsWin32).indexOf(wmiBrightness.hwid[2]) < 0) {
                            updateDisplay(monitors, wmiBrightness.hwid[2], { type: "none" })
                        }
                    }
                    console.log(`Refresh WMI Brightness Total: ${process.hrtime(startTime)[1] / 1000000}ms`)
                } catch (e) {
                    console.log("Failed to refresh WMI Brightness", e)
                }
            }

            // Hide internal
            if (settings?.hideClosedLid) {
                const wmiMonitor = Object.values(monitors).find(mon => mon.type === "wmi")
                if (wmiMonitor && !monitorsWin32[wmiMonitor.hwid[2]]) {
                    updateDisplay(monitors, wmiMonitor.hwid[2], { type: "none" })
                }
            }

        }
    } catch (e) { console.log(e) }

    busyLevel = 0
    return monitors
}


getAllMonitors = async () => {
    const foundMonitors = {}
    let startTime = process.hrtime.bigint()
    let fullStartTime = process.hrtime.bigint()

    // List via WMIC (Windows 10)
    if (!wmicUnavailable) {
        try {
            const monitorsWMIC = await getMonitorsWMIC()
            console.log(`getMonitorsWMIC() Total: ${(startTime - process.hrtime.bigint()) / BigInt(-1000000)}ms`)
            for (const hwid2 in monitorsWMIC) {
                const monitor = monitorsWMIC[hwid2]
                updateDisplay(foundMonitors, hwid2, monitor)
            }
        } catch (e) {
            console.log("\x1b[41m" + "getMonitorsWMIC() failed!" + "\x1b[0m", e)
        }
    }

    // List via WMI
    if (canUseWmiBridge && !wmiFailed && wmicUnavailable) {
        try {
            const monitorsWMI = await getMonitorsWMI()
            console.log(`getMonitorsWMI() Total: ${(startTime - process.hrtime.bigint()) / BigInt(-1000000)}ms`)
            for (const hwid2 in monitorsWMI) {
                const monitor = monitorsWMI[hwid2]
                updateDisplay(foundMonitors, hwid2, monitor)
            }
        } catch (e) {
            console.log("\x1b[41m" + "getMonitorsWMI() failed!" + "\x1b[0m", e)
        }
    } else if (wmiFailed) {
        console.log("getMonitorsWMI() skipped due to previous failure.")
    }

    // List via Win32 (more details)
    if (!win32Failed) {
        try {
            startTime = process.hrtime.bigint()
            monitorsWin32 = await getMonitorsWin32()
            console.log(`getMonitorsWin32() Total: ${(startTime - process.hrtime.bigint()) / BigInt(-1000000)}ms`)

            for (const hwid2 in monitorsWin32) {
                const monitor = monitorsWin32[hwid2]
                updateDisplay(foundMonitors, hwid2, monitor)
            }
        } catch (e) {
            console.log("\x1b[41m" + "getMonitorsWin32() failed!" + "\x1b[0m", e)
        }
    } else {
        console.log("getMonitorsWin32() skipped due to previous failure.")
    }

    // DDC/CI Brightness + Features
    try {
        startTime = process.hrtime.bigint()
        const featuresList = await getFeaturesDDC()
        console.log(`getFeaturesDDC() Total: ${(startTime - process.hrtime.bigint()) / BigInt(-1000000)}ms`)

        for (const hwid2 in featuresList) {
            const monitor = featuresList[hwid2]
            const { features, id, hwid } = monitor
            let brightnessType = (features["0x10"] ? 0x10 : (features["0x13"] ? 0x13 : 0x00))

            // Use DDC Brightness overrides, if relevant
            if (typeof ddcBrightnessVCPs === "object" && Object.keys(ddcBrightnessVCPs).indexOf(hwid[1]) > -1) {
                brightnessType = ddcBrightnessVCPs[hwid[1]]
            }

            let ddcciInfo = {
                id: id,
                key: hwid2,
                hwid,
                features: features,
                type: (brightnessType ? "ddcci" : "none"),
                min: 0,
                max: 100,
                brightnessType: brightnessType,
                brightnessValues: (features["0x10"] ? features["0x10"] : (features["0x13"] ? features["0x13"] : [50, 100]))
            }
            ddcciInfo.brightnessRaw = ddcciInfo.brightnessValues[0]
            ddcciInfo.brightnessMax = ddcciInfo.brightnessValues[1]

            // Get normalization info
            ddcciInfo = applyRemap(ddcciInfo)

            // Unnormalize brightness
            ddcciInfo.brightness = normalizeBrightness(ddcciInfo.brightnessRaw, true, ddcciInfo.min, ddcciInfo.max)
            updateDisplay(foundMonitors, hwid2, ddcciInfo)
        }
    } catch (e) {
        console.log("\x1b[41m" + "getFeaturesDDC() failed!" + "\x1b[0m", e)
    }

    if (!wmicUnavailable) {
        try {
            startTime = process.hrtime.bigint()
            const wmiBrightness = await getBrightnessWMIC()
            console.log(`getBrightnessWMIC() Total: ${(startTime - process.hrtime.bigint()) / BigInt(-1000000)}ms`)

            if (wmiBrightness) {
                updateDisplay(foundMonitors, wmiBrightness.hwid[2], wmiBrightness)

                // If Win32 doesn't find the internal display, hide it.
                if (settings?.hideClosedLid && Object.keys(monitorsWin32).indexOf(wmiBrightness.hwid[2]) < 0) {
                    updateDisplay(foundMonitors, wmiBrightness.hwid[2], { type: "none" })
                }
            }
        } catch (e) {
            console.log("\x1b[41m" + "getBrightnessWMIC() failed!" + "\x1b[0m", e)
        }
    }

    // WMI Brightness
    if (canUseWmiBridge && !wmiFailed && wmicUnavailable) {
        try {
            startTime = process.hrtime.bigint()
            const wmiBrightness = await getBrightnessWMI()
            console.log(`getBrightnessWMI() Total: ${(startTime - process.hrtime.bigint()) / BigInt(-1000000)}ms`)

            if (wmiBrightness) {
                updateDisplay(foundMonitors, wmiBrightness.hwid[2], wmiBrightness)

                // If Win32 doesn't find the internal display, hide it.
                if (settings?.hideClosedLid && Object.keys(monitorsWin32).indexOf(wmiBrightness.hwid[2]) < 0) {
                    updateDisplay(foundMonitors, wmiBrightness.hwid[2], { type: "none" })
                }
            }
        } catch (e) {
            console.log("\x1b[41m" + "getBrightnessWMI() failed!" + "\x1b[0m", e)
        }
    } else if (wmiFailed) {
        console.log("getBrightnessWMI() skipped due to previous failure.")
    }

    // Hide internal
    if (settings?.hideClosedLid) {
        const wmiMonitor = Object.values(foundMonitors).find(mon => mon.type === "wmi")
        if (wmiMonitor && !monitorsWin32[wmiMonitor.hwid[2]]) {
            updateDisplay(foundMonitors, wmiMonitor.hwid[2], { type: "none" })
        }
    }

    // Finally, fix names/num
    try {
        let idx = 0
        for (const hwid2 in foundMonitors) {
            if (!foundMonitors[hwid2].name) foundMonitors[hwid2].name = `${localization.GENERIC_DISPLAY_SINGLE} ${idx + 1}`;
            foundMonitors[hwid2].num = idx;
            idx++
        }
    } catch (e) {
        console.log("\x1b[41m" + "Fixing names failed!" + "\x1b[0m", e)
    }

    console.log(`getAllMonitors() total: ${(fullStartTime - process.hrtime.bigint()) / BigInt(-1000000)}ms`)
    try {
        console.log(`Monitors found: ${Object.keys(foundMonitors)}`)
    } catch (e) { }
    return foundMonitors
}

let wmiFailed = false
getMonitorsWMI = () => {
    return new Promise(async (resolve, reject) => {
        const foundMonitors = {}
        try {
            const timeout = setTimeout(() => { wmiFailed = true; console.log("getMonitorsWMI Timed out."); reject({}) }, 4000)
            const wmiMonitors = await wmibridge.getMonitors();

            if (wmiMonitors.failed) {
                // Something went wrong
                console.log("\x1b[41m" + "Recieved FAILED response from getMonitors()" + "\x1b[0m")
                clearTimeout(timeout)
                resolve(foundMonitor)
            } else {
                // Sort through results
                for (let monitorHWID in wmiMonitors) {
                    const monitor = wmiMonitors[monitorHWID]

                    if (!monitor.InstanceName) continue;

                    let hwid = readInstanceName(monitor.InstanceName)
                    hwid[2] = hwid[2].split("_")[0]

                    const wmiInfo = {
                        id: `\\\\?\\${hwid[0]}#${hwid[1]}#${hwid[2]}`,
                        key: hwid[2],
                        hwid: hwid,
                        serial: monitor.SerialNumberID
                    }

                    if (monitor.UserFriendlyName !== null && monitor.UserFriendlyName !== "") {
                        wmiInfo.name = monitor.UserFriendlyName
                    }

                    foundMonitors[hwid[2]] = wmiInfo
                }
                clearTimeout(timeout)
            }
        } catch (e) {
            console.log(`getMonitorsWMI: Failed to get all monitors.`)
            console.log(e)
        }
        resolve(foundMonitors)
    })
}

let win32Failed = false
getMonitorsWin32 = () => {
    let foundDisplays = {}
    return new Promise(async (resolve, reject) => {
        try {
            const timeout = setTimeout(() => { win32Failed = true; console.log("getMonitorsWin32 Timed out."); reject({}) }, 4000)
            let displays = []
            const displayConfig = await w32disp.extractDisplayConfig()

            // Filter results
            for (const display of displayConfig) {
                // Must be an active display
                if(display.inUse) {
                    displays.push(display)
                }
            }

            // Prepare results
            for (const monitor of displays) {
                const hwid = monitor.devicePath.split("#")
                hwid[2] = hwid[2].split("_")[0]

                const win32Info = {
                    id: `\\\\?\\${hwid[0]}#${hwid[1]}#${hwid[2]}`,
                    key: hwid[2],
                    connector: monitor.outputTechnology,
                    hwid: hwid,
                    sourceID: monitor.sourceConfigId?.id,
                    scaling: monitor.scaling,
                    bounds: monitor.sourceMode
                }
                if (monitor.displayName?.length > 0) {
                    win32Info.name = monitor.displayName;
                }

                foundDisplays[hwid[2]] = win32Info
            }

            // Return prepared results
            clearTimeout(timeout)
            resolve(foundDisplays)
        } catch (e) {
            console.log(`getMonitorsWin32: Failed to get all monitors. (L2)`)
            console.log(e)
            resolve(foundDisplays)
        }
    })
}

getFeaturesDDC = () => {
    const monitorFeatures = {}
    return new Promise(async (resolve, reject) => {
        try {
            const timeout = setTimeout(() => { console.log("getFeaturesDDC Timed out."); reject({}) }, 14000)
            getDDCCI()
            ddcci._refresh()
            const ddcciMonitors = ddcci.getMonitorList()

            for (let monitor of ddcciMonitors) {
                const hwid = monitor.split("#")
                let features = []

                // Yes, we're doing this 2 times because DDC/CI is flaky sometimes
                features = await checkMonitorFeatures(monitor);
                features = await checkMonitorFeatures(monitor);

                monitorFeatures[hwid[2]] = {
                    id: `${hwid[0]}#${hwid[1]}#${hwid[2]}`,
                    hwid,
                    features
                }
            }
            clearTimeout(timeout)
        } catch (e) {
            console.log(`getFeaturesDDC: Failed to get features.`)
            console.log(e)
        }

        resolve(monitorFeatures)
    })
}

checkMonitorFeatures = async (monitor) => {
    return new Promise(async (resolve, reject) => {
        const features = {}
        const featureTestTime = 100
        try {
            // This part is flaky, so we'll do it slowly
            features["0x10"] = checkVCPIfEnabled(monitor, 0x10, "luminance")
            await wait(featureTestTime)
            features["0x13"] = checkVCPIfEnabled(monitor, 0x13, "brightness")
            await wait(featureTestTime)
            features["0x12"] = checkVCPIfEnabled(monitor, 0x12, "contrast")
            await wait(featureTestTime)
            features["0xD6"] = checkVCPIfEnabled(monitor, 0xD6, "powerState")
            await wait(featureTestTime)
            features["0x62"] = checkVCPIfEnabled(monitor, 0x62, "volume")

            // Get custom DDC/CI features
            const hwid = monitor.split("#")
            const settingsFeatures = settings?.monitorFeatures?.[hwid[1]]
            if(settingsFeatures) {
                for(const vcp in settingsFeatures) {
                    if(vcp == "0x10" || vcp == "0x12" || vcp == "0x13" || vcp == "0x62" || vcp == "0xD6") {
                        continue; // Skip if built-in feature
                    }
                    if(settingsFeatures[vcp]) {
                        await wait(featureTestTime)
                        features[vcp] = checkVCPIfEnabled(monitor, parseInt(vcp), vcp)
                    }
                }
            }
            
        } catch (e) {
            console.log(e)
        }
        resolve(features)
    })
}

getBrightnessWMI = () => {
    // Request WMI monitors.
    return new Promise(async (resolve, reject) => {
        try {
            const timeout = setTimeout(() => { console.log("getBrightnessWMI Timed out."); reject(false) }, 4000)
            const monitor = await wmibridge.getBrightness();
            if (monitor.failed) {
                // Something went wrong
                clearTimeout(timeout)
                resolve(false)
            } else {
                let hwid = readInstanceName(monitor.InstanceName)
                hwid[2] = hwid[2].split("_")[0]

                let wmiInfo = {
                    id: `\\\\?\\${hwid[0]}#${hwid[1]}#${hwid[2]}`,
                    brightness: monitor.Brightness,
                    hwid: hwid,
                    min: 0,
                    max: 100,
                    type: 'wmi',
                }

                // Get normalization info
                wmiInfo = applyRemap(wmiInfo)

                // Unnormalize brightness
                wmiInfo.brightnessRaw = monitor.Brightness
                wmiInfo.brightness = normalizeBrightness(wmiInfo.brightness, true, wmiInfo.min, wmiInfo.max)
                clearTimeout(timeout)

                resolve(wmiInfo)
            }
        } catch (e) {
            console.log(e)
            debug.log(e)
            resolve(false)
        }
    })

}

getBrightnessDDC = (monitorObj) => {
    return new Promise((resolve, reject) => {
        let monitor = Object.assign({}, monitorObj)

        try {
            const timeout = setTimeout(() => { console.log("getBrightnessDDC Timed out."); reject({}) }, 8000)
            const ddcciPath = monitor.hwid.join("#")

            // If brightness is not supported, stop
            if (!monitor?.brightnessType) {
                clearTimeout(timeout)
                resolve(monitor)
                return false
            }

            // Determine / get brightness
            let brightnessValues = checkVCP(ddcciPath, monitor.brightnessType)

            // If something goes wrong and there are previous values, use those
            if (!brightnessValues) {
                console.log(`\x1b[41mNO BRIGHTNESS VALUES AVAILABLE FOR ${monitorObj.hwid[1]}\x1b[0m`)
                if (monitor.brightnessRaw !== undefined && monitor.brightnessMax !== undefined) {
                    console.log("\x1b[41mUSING PREVIOUS VALUES\x1b[0m")
                    brightnessValues = [monitor.brightnessRaw, monitor.brightnessMax]
                } else if (vcpCache[monitor] && vcpCache[monitor]["vcp_" + 0x10]) {
                    console.log("\x1b[41mUSING VCP CACHE\x1b[0m")
                    brightnessValues = vcpCache[monitor]["vcp_" + 0x10];
                } else {
                    console.log("CATASTROPHIC FAILURE", monitor)
                    // Catastrophic failure. Revert to defaults.
                    brightnessValues = [50, 100]
                }
            }

            monitor.brightness = brightnessValues[0] * (100 / (brightnessValues[1] || 100))
            monitor.brightnessMax = (brightnessValues[1] || 100)
            monitor.brightnessRaw = brightnessValues[0] // Raw value from DDC/CI. Not normalized or adjusted.


            // Get normalization info
            monitor = applyRemap(monitor)
            // Unnormalize brightness
            monitor.brightness = normalizeBrightness(monitor.brightness, true, monitor.min, monitor.max)
            clearTimeout(timeout)
            resolve(monitor)

        } catch (e) {
            console.log("updateBrightnessDDC: Couldn't get DDC/CI brightness.")
            console.log(e)
            resolve(monitorObj)
        }

    })
}

updateDisplay = (monitors, hwid2, info = {}) => {
    if (!monitors[hwid2]) {
        monitors[hwid2] = {
            id: null,
            key: null,
            num: null,
            brightness: 50,
            brightnessMax: 100,
            brightnessRaw: 50,
            type: "none",
            connector: "unknown",
            min: 0,
            max: 100,
            hwid: [],
            name: null,
            serial: null
        }
    }
    Object.assign(monitors[hwid2], info)
    return true
}

function setBrightness(brightness, id) {
    try {
        if (id) {
            let monitor = Object.values(monitors).find(mon => mon.id?.indexOf(id) >= 0)
            monitor.brightness = brightness
            setVCP(monitor.hwid.join("#"), monitor.brightnessType, brightness)
        } else {
            let monitor = Object.values(monitors).find(mon => mon.type == "wmi")
            monitor.brightness = brightness
            monitor.brightnessRaw = brightness
            if (!canUseWmiBridge || wmiFailed) {
                // If native WMI is disabled, fall back to old method
                exec(`powershell.exe -NoProfile (Get-WmiObject -Namespace root\\wmi -Class WmiMonitorBrightnessMethods).wmisetbrightness(0, ${brightness})"`)
            } else {
                // Set brightness via native WMI
                wmibridge.setBrightness(brightness);
            }
        }
    } catch (e) {
        console.log(`Couldn't update brightness! [${id}]`);
        console.log(monitors)
        console.log(e)
    }
}

let vcpCache = {}
function checkVCPIfEnabled(monitor, code, setting, skipCache = false) {
    try {
        const hwid = monitor.split("#")
        const vcpString = `0x${parseInt(code).toString(16).toUpperCase()}`
        const userEnabledFeature = settings?.monitorFeatures?.[hwid[1]]?.[vcpString]

        // If we previously saw that a feature was supported, we shouldn't have to check again.
        if ((!skipCache || !userEnabledFeature) && vcpCache[monitor] && vcpCache[monitor]["vcp_" + vcpString]) return vcpCache[monitor]["vcp_" + vcpString];

        const vcpResult = checkVCP(monitor, code)
        return vcpResult
    } catch (e) {
        console.log(e)
        return false
    }
}

function checkVCP(monitor, code, skipCacheWrite = false) {
    try {
        let result = ddcci._getVCP(monitor, code)
        const vcpString = `0x${parseInt(code).toString(16).toUpperCase()}`
        if (!skipCacheWrite) {
            if (!vcpCache[monitor]) vcpCache[monitor] = {};
            vcpCache[monitor]["vcp_" + vcpString] = result
        }
        return result
    } catch (e) {
        return false
    }
}

function setVCP(monitor, code, value) {
    try {
        const vcpString = `0x${parseInt(code).toString(16).toUpperCase()}`
        let result = ddcci._setVCP(monitor, code, (value * 1))
        if (vcpCache[monitor]?.["vcp_" + vcpString]) {
            vcpCache[monitor]["vcp_" + vcpString][0] = (value * 1)
        }
        
        const hwid = monitor.split("#")
        if(monitors[hwid[2]]?.features?.[vcpString]) {
            monitors[hwid[2]].features[vcpString][0] = parseInt(value)
        }
        return result
    } catch (e) {
        return false
    }
}

function normalizeBrightness(brightness, unnormalize = false, min = 0, max = 100) {
    return brightness // Disabled because it wasn't working
    // Clean this up later
    // Really
    // Do it
    let level = brightness
    if (level > 100) level = 100;
    if (level < 0) level = 0;
    if (min > 0 || max < 100) {
        let out = level
        if (!unnormalize) {
            // Normalize
            out = (min + ((level / 100) * (max - min)))
        } else {
            // Unnormalize
            out = ((level - min) * (100 / (max - min)))
        }
        if (out > 100) out = 100;
        if (out < 0) out = 0;

        return Math.round(out)
    } else {
        return level
    }
}



function applyRemap(monitor) {
    if (settings.remaps) {
        for (let remapName in settings.remaps) {
            if (remapName == monitor.name || remapName == monitor.id) {
                let remap = settings.remaps[remapName]
                monitor.min = remap.min
                monitor.max = remap.max
                // Stop if using new scheme
                if (remapName == monitor.id) return monitor;
            }
        }
    }
    if (typeof monitor.min === "undefined") monitor.min = 0;
    if (typeof monitor.max === "undefined") monitor.max = 100;
    return monitor
}


function readInstanceName(insName) {
    return (insName ? insName.replace(/&amp;/g, '&').split("\\") : undefined)
}

function parseWMIString(str) {
    if (str === null) return str;
    let hexed = str.replace('{', '').replace('}', '').replace(/;0/g, ';32')
    var decoded = '';
    var split = hexed.split(';')
    for (var i = 0; (i < split.length); i++)
        decoded += String.fromCharCode(parseInt(split[i], 10));
    decoded = decoded.trim()
    return decoded;
}

let ddcci = false
function getDDCCI() {
    if (ddcci) return true;
    try {
        ddcci = require("@hensm/ddcci");
        return true;
    } catch (e) {
        console.log('Couldn\'t start DDC/CI', e);
        return false;
    }
}
getDDCCI();

let wmicUnavailable = false
let wmi = false
// WMIC
function getWMIC() {
    if (wmi) return true;
    let WmiClient = false
    if (!require('fs').existsSync(process.env.SystemRoot + "\\System32\\Wbem\\WMIC.exe")) {
        console.log("\x1b[41mWARNING: WMIC unavailable! Using WMI Bridge instead.\x1b[0m")
        wmicUnavailable = true
        return false;
    }
    try {
        if (isDev) {
            WmiClient = require('wmi-client');
        } else {
            let path = process.argv.find((val) => { return (val.indexOf("--apppath=") >= 0) }).substring(10)
            WmiClient = require(require('path').join(path, '../node_modules/wmi-client'));
        }
        wmi = new WmiClient({
            host: 'localhost',
            namespace: '\\\\root\\WMI'
        });
        return true;
    } catch (e) {
        console.log('Couldn\'t start WMI', e);
        wmicUnavailable = true
        return false;
    }
}
getWMIC();

// Request Monitors via WMIC. (Windows 10 only)
getMonitorsWMIC = () => {

    return new Promise((resolve, reject) => {
        const wmiOK = getWMIC();
        if (!wmiOK) {
            resolve(false);
            return false;
        }
        wmi.query('SELECT * FROM WmiMonitorID', function (err, result) {
            let foundMonitors = {}
            if (err != null) {
                resolve(false)
            } else if (result) {
                // Apply names

                for (let monitor of result) {

                    if (!monitor.InstanceName) continue;

                    let hwid = readInstanceName(monitor.InstanceName)
                    hwid[2] = hwid[2].split("_")[0]

                    const wmiInfo = {
                        id: `\\\\?\\${hwid[0]}#${hwid[1]}#${hwid[2]}`,
                        key: hwid[2],
                        hwid: hwid,
                        serial: parseWMIString(monitor.SerialNumberID)
                    }

                    if (monitor.UserFriendlyName !== null && monitor.UserFriendlyName !== "") {
                        wmiInfo.name = parseWMIString(monitor.UserFriendlyName)
                    }

                    foundMonitors[hwid[2]] = wmiInfo
                }

                resolve(foundMonitors)
            } else {
                resolve(foundMonitors)
            }
        });
    })

}

// Request WMI brightness via WMIC. (Windows 10 only)
const getBrightnessWMIC = async () => {

    return new Promise((resolve, reject) => {
        try {
            const wmiOK = getWMIC();
            if (!wmiOK) {
                resolve(false);
                return {};
            }
            wmi.query('SELECT * FROM WmiMonitorBrightness', function (err, result) {
                if (err != null) {
                    resolve(false)
                } else if (result) {

                    for (let monitor of result) {

                        let hwid = readInstanceName(monitor.InstanceName)
                        hwid[2] = hwid[2].split("_")[0]

                        let wmiInfo = {
                            id: `\\\\?\\${hwid[0]}#${hwid[1]}#${hwid[2]}`,
                            brightness: monitor.CurrentBrightness,
                            hwid: hwid,
                            min: 0,
                            max: 100,
                            type: 'wmi',
                        }

                        // Get normalization info
                        wmiInfo = applyRemap(wmiInfo)

                        // Unnormalize brightness
                        wmiInfo.brightnessRaw = wmiInfo.brightness
                        wmiInfo.brightness = normalizeBrightness(wmiInfo.brightness, true, wmiInfo.min, wmiInfo.max)

                        resolve(wmiInfo)
                    }
                    resolve(false)
                } else {
                    reject(false)
                }
            });

        } catch (e) {
            debug.log(e)
            resolve(false)
        }
    })

}

function wait(time = 2000) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(true);
        }, time);
    });
}

process.send({
    type: 'ready'
})
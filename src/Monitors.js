const tag = "\x1b[47m M \x1b[0m";
const oLog = console.log
console.log = (...args) => { args.unshift(tag); oLog(...args) }
console.log("Monitors.js starting. If you see this again, something bad happened!")
const w32disp = require("win32-displayconfig");
const wmibridge = require("wmi-bridge");
const hdr = require("windows-hdr");
const { exec } = require('child_process');
require("os").setPriority(0, require("os").constants.priority.PRIORITY_BELOW_NORMAL)

let lastDDCCIList = []
let lastRefresh = {}
let lastWin32 = {}
let lastWMI = {}
let lastHDR = {}

function deepCopy(obj) {
    try {
        return JSON.parse(JSON.stringify(obj))
    } catch(e) {
        return false
    }
}

process.on('message', async (data) => {
    try {
        if (data.type === "refreshMonitors") {
            if(data.clearCache) {
                vcpCache = {}
                monitorReports = {}
                monitorReportsRaw = {}
            }
            refreshMonitors(data.fullRefresh, data.ddcciType).then((results) => {
                lastRefresh = deepCopy(results)
                process.send({
                    type: 'refreshMonitors',
                    monitors: results
                })
            })
        } else if (data.type === "brightness") {
            setBrightness(data.brightness, data.id)
        }  else if (data.type === "sdr") {
            setSDRBrightness(data.brightness, data.id)
        } else if (data.type === "settings") {
            settings = data.settings

            // Overrides
            if (settings?.disableAppleStudio) appleStudioUnavailable = true;
            if (settings?.disableWMIC) wmicUnavailable = true;
            if (settings?.disableWMI) wmiFailed = true;
            if (settings?.disableWin32) win32Failed = true;

        } else if (data.type === "ddcBrightnessVCPs") {
            ddcBrightnessVCPs = data.ddcBrightnessVCPs
            // Update brightnessType for all monitors when user changes VCP settings
            if (monitors) {
                for (const hwid2 in monitors) {
                    if (monitors[hwid2].type === "ddcci") {
                        const hwid = monitors[hwid2].hwid
                        if (hwid) {
                            if (ddcBrightnessVCPs[hwid[1]]) {
                                // Custom VCP code set - use it (already parsed as int in electron.js)
                                const vcpCode = ddcBrightnessVCPs[hwid[1]]
                                if (!isNaN(vcpCode) && vcpCode >= 0 && vcpCode <= 0xFF) {
                                    monitors[hwid2].brightnessType = vcpCode
                                } else {
                                    // Invalid VCP code, fall back to default
                                    monitors[hwid2].brightnessType = 0x10
                                }
                            } else {
                                // No custom VCP - reset to default (0x10 = 16)
                                monitors[hwid2].brightnessType = 0x10
                            }
                        }
                    }
                }
            }
        } else if (data.type === "localization") {
            localization = data.localization
        } else if (data.type === "vcp") {
            setVCP(data.monitor, data.code, data.value)
        } else if (data.type === "flushvcp") {
            vcpCache = {}
            monitorReports = {}
            monitorReportsRaw = {}
            ddcci._clearDisplayCache()
        } else if (data.type === "wmi-bridge-ok") {
            canUseWmiBridge = data.value
        } else if (data.type === "getVCP") {
            getDDCCI()
            const vcp = await checkVCP(data.monitor, data.code)
            process.send({
                type: `getVCP::${data.monitor}::${data.code}`,
                monitor: data.monitor,
                code: data.code,
                value: vcp
            })
        } else if (data.type === "getReport") {
            process.send({
                type: `getReport`,
                report: {
                    lastDDCCIList,
                    lastWMI,
                    lastWin32,
                    lastHDR,
                    monitorsAppleStudio,
                    monitorReports,
                    monitorReportsRaw,
                    lastRefresh,
                    settings
                }
            })
        }
    } catch (e) {
        console.log(e)
    }
})

let isDev = (process.argv.indexOf("--isdev=true") >= 0)
let skipTest = (process.argv.indexOf("--skiptest=true") >= 0)

let monitors = false
let monitorNames = []
let monitorsAppleStudio = {}
let monitorsWin32 = {}
let monitorReports = {}
let monitorReportsRaw = {}

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
            const foundMonitors = await getAllMonitors(determineDDCCIMethod())
            monitors = foundMonitors
        } else {
            let startTime = process.hrtime()

            // DDC/CI
            try {
                if (settings?.getDDCBrightnessUpdates) {
                    if(!getDDCCI()) {
                        ddcci._refresh(determineDDCCIMethod(), true, !settings.disableHighLevel)
                    }
                    for (const hwid2 in monitors) {
                        if (monitors[hwid2].type === "ddcci" && monitors[hwid2].brightnessType) {
                            const monitor = await getBrightnessDDC(monitors[hwid2])
                            monitors[hwid2] = monitor
                        }
                    }
                    console.log(`getBrightnessDDC() Total: ${process.hrtime(startTime)[1] / 1000000}ms`)
                }
            } catch (e) {
                console.log("\x1b[41m" + "getBrightnessDDC() failed!" + "\x1b[0m", e)
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
                    startTime = process.hrtime.bigint()
                    const wmiBrightness = await getBrightnessWMI()
                    if (wmiBrightness) {
                        updateDisplay(monitors, wmiBrightness.hwid[2], wmiBrightness)

                        // If Win32 doesn't find the internal display, hide it.
                        if (settings?.hideClosedLid && Object.keys(monitorsWin32).indexOf(wmiBrightness.hwid[2]) < 0) {
                            updateDisplay(monitors, wmiBrightness.hwid[2], { type: "none" })
                        }
                    }
                    console.log(`getBrightnessWMI() Total: ${(startTime - process.hrtime.bigint()) / BigInt(-1000000)}ms`)
                } catch (e) {
                    console.log("\x1b[41m" + "getBrightnessWMI() failed!" + "\x1b[0m", e)
                }
            }

            // Apple Studio displays
            if (!appleStudioUnavailable) {
                try {
                    startTime = process.hrtime.bigint()
                    monitorsAppleStudio = await getStudioDisplay(monitors);
                    console.log(`getStudioDisplay() Total: ${(startTime - process.hrtime.bigint()) / BigInt(-1000000)}ms`)
                } catch (e) {
                    console.log("\x1b[41m" + "getStudioDisplay() failed!" + "\x1b[0m", e)
                }
            }

            // HDR
            if (!settings?.disableHDR) {
                try {
                    startTime = process.hrtime.bigint()
                    monitorsHDR = await getHDRDisplays(monitors);
                    console.log(`getHDRDisplays() Total: ${(startTime - process.hrtime.bigint()) / BigInt(-1000000)}ms`)
                } catch (e) {
                    console.log("\x1b[41m" + "getHDRDisplays() failed!" + "\x1b[0m", e)
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


getAllMonitors = async (ddcciMethod = "default") => {
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

    // List Apple Studio displays
    if (!appleStudioUnavailable) {
        try {
            startTime = process.hrtime.bigint()
            monitorsAppleStudio = await getStudioDisplay(foundMonitors);
            console.log(`getStudioDisplay() Total: ${(startTime - process.hrtime.bigint()) / BigInt(-1000000)}ms`)
        } catch (e) {
            console.log("\x1b[41m" + "getStudioDisplay() failed!" + "\x1b[0m", e)
        }
    } else {
        console.log("getStudioDisplay() skipped due to previous failure.")
    }
    

    // DDC/CI Brightness + Features
    try {
        startTime = process.hrtime.bigint()
        const featuresList = await getFeaturesDDC(ddcciMethod, false)

        for (const hwid2 in featuresList) {
            const monitor = featuresList[hwid2]
            const { features, id, hwid, vcpCodes, path, ddcciSupported, highLevelSupported } = monitor
            const brightnessType = await determineBrightnessVCPCode(id)

            let ddcciInfo = {
                id: id,
                key: hwid2,
                hwid,
                path,
                ddcciSupported,
                highLevelSupported,
                features: features,
                vcpCodes: vcpCodes,
                type: ((ddcciSupported || highLevelSupported?.brightness) && brightnessType ? "ddcci" : "none"),
                min: 0,
                max: 100,
                brightnessType: brightnessType,
                brightnessValues: (features[brightnessType] ? features[brightnessType] : [50, 100])
            }

            let brightness;
            if(!settings.disableHighLevel && monitor.highLevelSupported?.brightness && !(brightnessType > 0x10)) {
                brightness = await getHighLevelBrightness(id)
            } else {
                brightness = await checkVCP(id, parseInt(brightnessType))
            }
            
            // Force lower max brightness for testing
            if(brightness?.[1]) {
                if(settings.debugForceBrightnessMax) brightness[1] = settings.debugForceBrightnessMax
            }

            if(brightness) {
                ddcciInfo.brightnessValues = brightness
                features[vcpStr(brightnessType)] = brightness
            }       

            ddcciInfo.brightnessRaw = ddcciInfo.brightnessValues[0]
            ddcciInfo.brightnessMax = ddcciInfo.brightnessValues[1]

            // Get normalization info
            ddcciInfo = applyRemap(ddcciInfo)

            // Unnormalize brightness
            ddcciInfo.brightness = normalizeBrightness(ddcciInfo.brightnessRaw, true, ddcciInfo.min, ddcciInfo.max)
            updateDisplay(foundMonitors, hwid2, ddcciInfo)
        }
        console.log(`getFeaturesDDC() Total: ${(startTime - process.hrtime.bigint()) / BigInt(-1000000)}ms`)
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

    // HDR
    if (!settings.disableHDR) {
        try {
            startTime = process.hrtime.bigint()
            monitorsHDR = await getHDRDisplays(foundMonitors);
            console.log(`getHDRDisplays() Total: ${(startTime - process.hrtime.bigint()) / BigInt(-1000000)}ms`)
        } catch (e) {
            console.log("\x1b[41m" + "getHDRDisplays() failed!" + "\x1b[0m", e)
        }
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

function determineDDCCIMethod() {
    let ddcciMethod = (isFastFine ? "fast" : "accurate")

    const savedMethod = settings?.preferredDDCCIMethod
    const ddcciMethodValues = ["fast", "accurate", "no-validation", "legacy"]
    if(savedMethod && ddcciMethodValues.indexOf(savedMethod) >= 0) {
        ddcciMethod = savedMethod
    } 
    return ddcciMethod
}

let appleStudioUnavailable = false
getStudioDisplay = async (monitors) => {
    try {
        const sdctl = require("studio-display-control")
        const displays = {}
        let count = 0
        for (const display of sdctl.getDisplays()) {
            const serial = await display.getSerialNumber();
            const hwid = [
                "\\\\?\\DISPLAY",
                "APPAE3A",
                `APLSTD-${serial}-NUM${count}`
            ]
            updateDisplay(monitors, hwid[2], {
                name: "Apple Studio Display",
                type: "studio-display",
                key: hwid[2],
                id: `\\\\?\\${hwid[0]}#${hwid[1]}#${hwid[2]}`,
                hwid,
                serial,
                brightness: await display.getBrightness()
            });
            displays[hwid[2]] = display
            count++
        }
        return displays
    } catch (e) {
        console.log("\x1b[41m" + "getStudioDisplay(): failed to access Studio Display" + "\x1b[0m", e)
    }
    return {}
}

setStudioDisplayBrightness = async (serial, brightness) => {
    try {
        const sdctl = require("studio-display-control")
        for (const monitor of sdctl.getDisplays()) {
            const s = await monitor.getSerialNumber();
            if (s === serial) {
                await monitor.setBrightness(brightness);
            }
        }
    } catch (e) {
        console.log("\x1b[41m" + "setStudioDisplayBrightness(): failed to set brightness" + "\x1b[0m", e)
    }
}

getHDRDisplays = async (monitors) => {
    try {
        const displays = hdr.getDisplays()
        lastHDR = displays
        for(const display of displays) {
            const hwid = display.path.split("#")

            const newDisplay = {
                key: hwid[2],
                id: display.path,
                hwid,
                sdrNits: display.nits,
                sdrLevel: parseInt((display.nits - 80) / 4),
                hdr: (display.hdrActive ? "active" : display.hdrEnabled ? "supported" : "unsupported")
            }

            if(display.name) {
                newDisplay.name = display.name
            }

            updateDisplay(monitors, hwid[2], newDisplay);
            displays[hwid[2]] = display
        }
    } catch(e) {
        console.log("\x1b[41m" + "getHDRDisplays(): failed to access displays" + "\x1b[0m", e)
    }

    return monitors
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
        lastWMI = deepCopy(foundMonitors)
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
                    id: `${hwid[0]}#${hwid[1]}#${hwid[2]}`,
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
        } catch (e) {
            console.log(`getMonitorsWin32: Failed to get all monitors. (L2)`, e)
        }
        lastWin32 = deepCopy(foundDisplays)
        resolve(foundDisplays)
    })
}

getFeaturesDDC = (ddcciMethod = "accurate") => {
    const monitorFeatures = {}
    return new Promise(async (resolve, reject) => {
        try {
            const timeout = setTimeout(() => { console.log("getFeaturesDDC Timed out."); reject({}) }, 80000)
            
            getDDCCI()
            await wait(10)

            // Sometimes the handles returned are NULL, so we should try again.
            let tmpDdcciMonitors = ddcci.getAllMonitors(ddcciMethod, true, !settings.disableHighLevel)
            if(tmpDdcciMonitors) {
                let doRetry = false
                for(const monitor of tmpDdcciMonitors) {
                    if(monitor.handleIsValid === false) {
                        doRetry = monitor
                        break
                    }
                }
                if(doRetry) {
                    console.log(`DDC/CI results contain a null handle (${doRetry?.deviceKey}). Trying again.`)
                    await wait(200)
                    tmpDdcciMonitors = ddcci.getAllMonitors(ddcciMethod, true, !settings.disableHighLevel)
                    for(const monitor of tmpDdcciMonitors) {
                        if(monitor.handleIsValid === false) {
                            console.log(`DDC/CI results still contain a null handle (${doRetry?.deviceKey}). Continuing anyway.`)
                            break
                        }
                    }
                }
            }

            const ddcciMonitors = tmpDdcciMonitors
            lastDDCCIList = ddcciMonitors

            for (let monitor of ddcciMonitors) {
                const id = monitor.deviceKey
                const featureTimeout = setTimeout(() => { console.log("getFeaturesDDC Timed out on monitor:", id); reject({}) }, 15000)
                const hwid = id.split("#")
                let features = {}

                // Apply capabilities report, if available.
                if(monitor.capabilities && !monitorReports[id]) {
                    monitorReports[id] = monitor.capabilities
                }

                if(monitor.ddcciSupported) {
                    await wait(10)
                    features = await checkMonitorFeatures(id, false, ddcciMethod)
                }

                monitorFeatures[hwid[2]] = {
                    id: `${hwid[0]}#${hwid[1]}#${hwid[2]}`,
                    hwid,
                    features,
                    ddcciSupported: monitor.ddcciSupported,
                    highLevelSupported: {
                        brightness: monitor.hlBrightnessSupported,
                        contrast: monitor.hlContrastSupported
                    },
                    path: monitor.fullName,
                    vcpCodes: (monitorReports[id] ? monitorReports[id] : {} )
                }
                clearTimeout(featureTimeout)
            }
            clearTimeout(timeout)
        } catch (e) {
            console.log(`getFeaturesDDC: Failed to get features.`)
            console.log(e)
        }

        resolve(monitorFeatures)
    })
}

checkMonitorFeatures = async (monitor, skipCache = false, ddcciMethod = "accurate") => {
    return new Promise(async (resolve, reject) => {
        const features = {}
        try {
            const hwid = monitor.split("#")

            // Detect valid VCP codes for display if not already available
            try {
                if(ddcciMethod === "accurate" && !monitorReports[monitor]) {
                    const reportRaw = ddcci.getCapabilitiesRaw(monitor)
                    if(reportRaw) {
                        monitorReportsRaw[monitor] = reportRaw
                        const report = ddcci._parseCapabilitiesString(reportRaw)
                        if(report && Object.keys(report)?.length > 0) {
                            monitorReports[monitor] = report
                        }
                    }
                }
            } catch(e) {
                console.log("Couldn't get capabilities report for monitor " + monitor)
            }

            let getAllValues = false
            if(getAllValues && monitorReports[monitor]) {
                for(const code in monitorReports[monitor]) {
                    features[vcpStr(code)] = await checkVCP(monitor, code)
                }
            } else {
                // Get custom DDC/CI features
                const settingsFeatures = settings?.monitorFeatures?.[hwid[1]]
                if(settingsFeatures) {
                    for(const vcp in settingsFeatures) {
                        if(ddcBrightnessVCPs[hwid[1]] && vcp == ddcBrightnessVCPs[hwid[1]]) {
                            continue; // Skip if custom brightness
                        }
                        if(settingsFeatures[vcp]) {
                            features[vcpStr(vcp)] = await checkVCPIfEnabled(monitor, parseInt(vcp), vcp, skipCache)
                        }
                    }
                }
                
                // Capabilities report allows us to skip this for unsupported codes, generally
                features["0x10"] = await checkVCPIfEnabled(monitor, 0x10, "luminance", skipCache)
                features["0x13"] = await checkVCPIfEnabled(monitor, 0x13, "brightness", skipCache)
                features["0x12"] = await checkVCPIfEnabled(monitor, 0x12, "contrast", skipCache)
                features["0xD6"] = await checkVCPIfEnabled(monitor, 0xD6, "powerState", skipCache)
                features["0x60"] = await checkVCPIfEnabled(monitor, 0x60, "inputControls", skipCache)
                features["0x62"] = await checkVCPIfEnabled(monitor, 0x62, "volume", skipCache)
            }


            
        } catch (e) {
            console.log(e)
        }
        resolve(features)
    })
}

determineBrightnessVCPCode = async (monitor) => {
    const hwid = monitor.split("#")
    if(ddcBrightnessVCPs?.[hwid[1]]) {
        return parseInt(ddcBrightnessVCPs[hwid[1]])
    }
    if(await checkIfVCPSupported(monitor, 0x10)) {
        return 0x10 // luminance
    }
    if(await checkIfVCPSupported(monitor, 0x13)) {
        return 0x13 // brightness
    }
    if(await checkIfVCPSupported(monitor, 0x6B)) {
        return 0x6b // backlight level white
    }
    if(await checkIfVCPSupported(monitor, 0x12)) {
        return 0x12 // contrast
    }
    return false
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
            resolve(false)
        }
    })

}

getBrightnessDDC = (monitorObj) => {
    return new Promise(async (resolve, reject) => {
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
            let brightnessValues = await checkVCP(ddcciPath, monitor.brightnessType)

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

            // Get custom DDC/CI features
            const settingsFeatures = settings?.monitorFeatures?.[monitor.hwid[1]]
            if(settingsFeatures) {
                for(const vcp in settingsFeatures) {
                    if(vcp == monitor.brightnessType) {
                        continue; // Skip brightness
                    }
                    if(settingsFeatures[vcp]) {
                        monitor.features[vcpStr(vcp)] = await checkVCP(monitor.id, parseInt(vcp))
                    }
                }
            }

            clearTimeout(timeout)
            resolve(monitor)

        } catch (e) {
            console.log("updateBrightnessDDC: Couldn't get DDC/CI brightness.", e)
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

function setSDRBrightness(brightness, id) {
    if(settings.disableHDR) return false;
    try {
        console.log("sdr", brightness, id)
        return hdr.setSDRBrightness(id, (brightness * 0.01 * 400) + 80)
    } catch(e) {
        console.log(`Couldn't update SDR brightness! [${id}]`, e);
        return false
    }
}

function setBrightness(brightness, id) {
    try {
        if (id) {
            let monitor = Object.values(monitors).find(mon => mon.id?.indexOf(id) >= 0)
            if(monitor) {
                monitor.brightness = brightness
                // Check if user has set a custom brightness VCP code for this monitor
                const hasCustomBrightnessVCP = monitor.hwid && ddcBrightnessVCPs[monitor.hwid[1]]
                if (monitor.type == "studio-display") {
                    setStudioDisplayBrightness(monitor.serial, brightness)
                } else if(!settings.disableHighLevel && monitor.highLevelSupported?.brightness && !hasCustomBrightnessVCP) {
                    setHighLevelBrightness(monitor.hwid.join("#"), brightness)
                } else {
                    setVCP(monitor.hwid.join("#"), monitor.brightnessType, brightness)
                }
                // Update tracked brightness values
                const brightnessRaw = parseInt(brightness)
                monitor.brightness = brightnessRaw * (100 / (monitor.brightnessMax || 100))
                monitor.brightnessRaw = brightnessRaw
                if(monitor.brightnessValues) monitor.brightnessValues[0] = brightnessRaw;
            }
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
async function checkVCPIfEnabled(monitor, code, setting, skipCache = false) {
    const vcpString = vcpStr(code)
    if(!code || code == "0x0") return false;
    try {
        const hwid = monitor.split("#")
        const userEnabledFeature = settings?.monitorFeatures?.[hwid[1]]?.[vcpString]
        const isInReport = monitorReports[monitor]?.[vcpString] ? true : false
        const hasReport = monitorReports[monitor] && Object.keys(monitorReports[monitor])?.length > 0 ? true : false
        
        if (hasReport && !isInReport) return false;

        // If we previously saw that a feature was supported, we shouldn't have to check again.
        if ((!skipCache || !userEnabledFeature) && vcpCache[monitor] && vcpCache[monitor]["vcp_" + vcpString]) return vcpCache[monitor]["vcp_" + vcpString];

        const vcpResult = await checkVCP(monitor, code)
        return vcpResult
    } catch (e) {
        console.log(`Error reading VCP code (if enabled) ${vcpString} for ${monitor}`, e)

        // Since it failed, let's check for an existing value first
        if(vcpCache[monitor]?.["vcp_" + vcpString]) {
            return vcpCache[monitor]["vcp_" + vcpString]
        }
        
        // Cached value can't be used, so we return false
        return false
    }
}

async function checkIfVCPSupported(monitor, code) {
    const vcpString = vcpStr(code)
    if(!code || code == "0x0") return false;
    try {
        const isInReport = monitorReports[monitor]?.[vcpString] ? true : false
        const hasReport = monitorReports[monitor] && Object.keys(monitorReports[monitor])?.length > 0 ? true : false
        
        if (hasReport && !isInReport) return false;

        // If we previously saw that a feature was supported, we shouldn't have to check again.
        if (vcpCache[monitor] && vcpCache[monitor]["vcp_" + vcpString]) return true;

        const vcpResult = await checkVCPIfEnabled(monitor, code)
        return (vcpResult ? true : false)
    } catch (e) {
        console.log(`Error checking VCP code support ${vcpString} for ${monitor}`, e)
        return false
    }
}

async function checkVCP(monitor, code, skipCacheWrite = false) {
    const vcpString = vcpStr(code)
    if(!code || code == "0x0") return false;
    try {
        let result = ddcci._getVCP(monitor, parseInt(vcpString))
        if (code === 96) return ddcci.getMonitorInputs(monitor)
        if (!skipCacheWrite) {
            if (!vcpCache[monitor]) vcpCache[monitor] = {};
            vcpCache[monitor]["vcp_" + vcpString] = result
        }
        if(settings.debugForceBrightnessMax && vcpString == "0x10") result[1] = settings.debugForceBrightnessMax; // Force lower max brightness for testing
        await wait(parseInt(settings?.checkVCPWaitMS || 20))
        return result
    } catch (e) {
        let reason = e
        if(e.message.indexOf("the I2C bus") > 0) reason = "I2C bus error";
        if(e.message.indexOf("does not support") > 0) reason = "VCP code unsupported";
        console.log(`Error reading VCP code ${vcpString} for ${monitor}. Reason: ${reason}`)

        // Since it failed, let's check for an existing value first
        if(vcpCache[monitor]?.["vcp_" + vcpString]) {
            return vcpCache[monitor]["vcp_" + vcpString]
        }
        
        // Cached value can't be used, so we return false
        return false
    }
}

async function setVCP(monitor, code, value) {
    if(busyLevel > 0) while(busyLevel > 0) { await wait(100) } // Wait until no longer busy
    try {
        const vcpString = vcpStr(code)
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

async function getHighLevelBrightness(monitor) {   
    try {
        let result = ddcci._getHighLevelBrightness(monitor)
        return result
    } catch (e) {
        console.log(e)
        return false
    }
}

async function setHighLevelBrightness(monitor, value) {
    if(busyLevel > 0) while(busyLevel > 0) { await wait(100) } // Wait until no longer busy   
    try {
        let result = ddcci._setHighLevelBrightness(monitor, value)
        return result
    } catch (e) {
        console.log(e)
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
    if (ddcci) return false;
    try {
        ddcci = require("@hensm/ddcci");
        if(isDev) ddcci._setLogLevel(2);
        return true;
    } catch (e) {
        console.log('Couldn\'t start DDC/CI', e);
        return false;
    }
}

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
            console.log(e)
            resolve(false)
        }
    })

}

function wait(ms = 2000) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(true);
        }, ms);
    });
}

function vcpStr(code) {
    return `0x${parseInt(code).toString(16).toUpperCase()}`
}

testDDCCIMethods = async () => {
    let fastIsFine = false
    try {
        if(skipTest) {
            console.log("Skipping DDC/CI test...")
            return false
        }

        console.log("Testing DDC/CI methods...")
        getDDCCI()
    
        let startTime = process.hrtime.bigint()
        const accurateResults = ddcci.getAllMonitors("accurate", false)
        const accurateIDs = []
        const accurateFeatures = []
        for(const monitor of accurateResults) {
            if(monitor.ddcciSupported) {
                accurateIDs.push(monitor.deviceKey)
                accurateFeatures[monitor.deviceKey] = await checkMonitorFeatures(monitor.deviceKey)
            }
        }
        const endTimeAcc = (startTime - process.hrtime.bigint()) / BigInt(-1000000)
        
        wait(50)
        vcpCache = {}
        monitorReports = {}
        monitorReportsRaw = {}
        ddcci._clearDisplayCache()
    
        startTime = process.hrtime.bigint()
        const fastResults = ddcci.getAllMonitors("fast", false)
        const fastIDs = []
        const fastFeatures = []
        for(const monitor of fastResults) {
            if(monitor.ddcciSupported) {
                fastIDs.push(monitor.deviceKey)
                fastFeatures[monitor.deviceKey] = await checkMonitorFeatures(monitor.deviceKey)
            }
        }
        const endTimeFast = (startTime - process.hrtime.bigint()) / BigInt(-1000000)
    
        fastIsFine = true
        let failReason
        if(fastResults.length !== accurateResults.length) {
            fastIsFine = false
            failReason = "Display counts don't match!"
        } else {
            for(const id of accurateIDs) {
                if(fastIDs.indexOf(id) === -1) {
                    fastIsFine = false
                    failReason = "Didn't find ID: " + id
                }
                if(JSON.stringify(fastFeatures[id]) != JSON.stringify(accurateFeatures[id])) {
                    failReason = "Features don't match: " + id
                }
            }
        }
        console.log("-------------- DDC/CI Tests --------------")
        console.log(`Accurate results took: ${endTimeAcc}ms`)
        console.log(`Fast results took: ${endTimeFast}ms`)
        console.log("Is fast fine?: " + fastIsFine)
        if(failReason) console.log("Reason: " + fastIsFine);
        if(!failReason) console.log(`Monitors: ${fastResults.length} | DDCCI: ${fastIDs.length}`);
        console.log("------------------------------------------")
        wait(50)
    } catch(e) {
        console.log("Error testing DDC/CI methods: ", e)
    }

    vcpCache = {}
    monitorReports = {}
    monitorReportsRaw = {}
    ddcci._clearDisplayCache()
    
    return fastIsFine
}


let isFastFine = true
testDDCCIMethods().then(result => {
    isFastFine = result
    if(!skipTest) {
        process.send({
            type: 'ddcciModeTestResult',
            value: isFastFine
        })
    }
    process.send({
        type: 'ready'
    })
})
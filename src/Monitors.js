const { exec } = require('child_process');
const fs = require('fs');
const w32disp = require("win32-displayconfig");
const wmibridge = require("wmi-bridge");


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
        } else if (data.type === "localization") {
            localization = data.localization
        } else if(data.type === "vcp") {
            setVCP(data.monitor, data.code, data.value)
        }
    } catch(e) {
        console.log(e)
    }
})

let debug = console

let isDev = (process.argv.indexOf("--isdev=true") >= 0)

let monitors = {}
let monitorNames = []

let settings = { order: [] }
let localization = {}

let busyLevel = 0
refreshMonitors = async (fullRefresh = false, ddcciType = "default", alwaysSendUpdate = false) => {
    if((busyLevel > 0 && !fullRefresh) || (busyLevel > 1 && fullRefresh)) {
        console.log("Thread busy. Cancelling refresh.")
        return false
    }
    busyLevel = (fullRefresh ? 2 : 1)

    const startTime = process.hrtime()

    try {
        let doWMI = true
        let doDDCCI = true

        if(fullRefresh) monitors = {};

        if (settings.useRefreshNamesWin32) {

            // Get info on all displays
            const namesPromiseWin32 = refreshNamesWin32()
            monitorNames = await namesPromiseWin32
            namesPromise.then(() => { console.log(`NAMES_WIN32 done in ${process.hrtime(startTime)[1] / 1000000}ms`) })

            // Determine if WMI or DDC/CI checks are needed based off of connectors used
            let doWMI = false
            let doDDCCI = false
            for (const hwid in monitors) {
                if (monitors[hwid].connector && monitors[hwid].connector.indexOf("internal") >= 0) {
                    // Is internal
                    doWMI = true;
                } else if (monitors[hwid].connector && monitors[hwid].connector.indexOf("internal") === -1) {
                    // Is external
                    doDDCCI = true;
                }
                if (doWMI && doDDCCI) break;
            }

        } else {
            // Get info on all displays
            const namesPromiseWin32 = refreshNamesWin32()
            await namesPromiseWin32
            namesPromiseWin32.then(() => { console.log(`NAMES_WIN32 done in ${process.hrtime(startTime)[1] / 1000000}ms`) })

            const namesPromise = refreshNames()
            monitorNames = await namesPromise
            namesPromise.then(() => { console.log(`NAMES done in ${process.hrtime(startTime)[1] / 1000000}ms`) })
        }

        let wmiPromise
        let ddcciPromise

        // WMI (internal display)
        if (doWMI) {
            wmiPromise = refreshWMI()
            wmiPromise.then(() => { console.log(`WMI done in ${process.hrtime(startTime)[1] / 1000000}ms`) })
        }

        // DDC/CI (external displays)
        if (doDDCCI) {
            ddcciPromise = refreshDDCCI((fullRefresh ? "features" : ddcciType))
            ddcciPromise.then(() => { console.log(`DDC/CI done in ${process.hrtime(startTime)[1] / 1000000}ms`) })
        }

        await wmiPromise
        await ddcciPromise

        // Clean up list
        monitors = getCleanList(monitors, monitorNames)

    } catch (e) {
        console.log(e)
    }
    busyLevel = 0

    console.log(`Total: ${process.hrtime(startTime)[1] / 1000000}ms`)
    return monitors;
}


//
//
//    Get monitor names
//
//
let namesCache = {};

refreshNames = () => {

    return new Promise((resolve, reject) => {

        const wmiMonitors = wmibridge.getMonitors();

        if(wmiMonitors.failed) {
            // Something went wrong
            resolve([])
        } else {
            // Apply names
            let foundMonitors = []
            for (let monitorHWID in wmiMonitors) {
                const monitor = wmiMonitors[monitorHWID]
                let hwid = readInstanceName(monitor.InstanceName)
                hwid[2] = hwid[2].split("_")[0]
                const wmiInfo = {
                    hwid: hwid,
                    serial: monitor.SerialNumberID
                }

                foundMonitors.push(hwid[2])

                if (monitors[hwid[2]] == undefined) {
                    monitors[hwid[2]] = {
                        id: `\\\\?\\${hwid[0]}#${hwid[1]}#${hwid[2]}`,
                        key: hwid[2],
                        num: false,
                        brightness: 50,
                        type: 'none',
                        min: 0,
                        max: 100,
                        hwid: false,
                        name: false,
                        serial: false
                    }
                }

                if (monitor.UserFriendlyName !== null && monitor.UserFriendlyName !== "") {
                    wmiInfo.name = monitor.UserFriendlyName
                    namesCache[hwid[2]] = monitor.UserFriendlyName
                }

                Object.assign(monitors[hwid[2]], wmiInfo)

            }

            resolve(foundMonitors)
        }
    })

}


refreshNamesWin32 = () => {

    return new Promise((resolve, reject) => {

        let foundMonitors = []

        w32disp.queryDisplayConfig().then((config) => {
            let displays = []
            config.nameArray.forEach((display, idx) => {
                if (display.monitorDevicePath) {
                    // Must also have a valid mode
                    let found = config.modeArray.find(mode => mode.value.id === display.id)
                    // If mode found, add to list
                    if (found) displays.push(display);
                }
            })

            for (let monitor of displays) {
                const hwid = monitor.monitorDevicePath.split("#")
                hwid[2] = hwid[2].split("_")[0]

                foundMonitors.push(hwid[2])

                if (monitors[hwid[2]] == undefined) {
                    monitors[hwid[2]] = {
                        id: monitor.monitorDevicePath,
                        key: hwid[2],
                        num: false,
                        brightness: 50,
                        type: 'none',
                        connector: monitor.outputTechnology,
                        min: 0,
                        max: 100,
                        hwid,
                        name: false,
                        serial: false
                    }
                }

                if (monitor.monitorFriendlyDeviceName.length > 0) {
                    monitors[hwid[2]].name = monitor.monitorFriendlyDeviceName;
                    namesCache[hwid[2]] = monitor.monitorFriendlyDeviceName;
                }

            }

            resolve(foundMonitors)

        });


    })

}



refreshDDCCI = async (type = "default") => {

    /*

    types
    default: get brightness + features (if not already found)
    features: get brightness + features
    features-only: get features

    */

    return new Promise((resolve, reject) => {
        let local = 0
        let ddcciList = []

        try {
            getDDCCI()
            ddcci._refresh()
            const ddcciMonitors = ddcci.getMonitorList()

            for (let monitor of ddcciMonitors) {

                try {

                    const hwid = monitor.split("#")
                    let ddcciInfo = {
                        name: makeName(hwid[2], `${localization.GENERIC_DISPLAY_SINGLE} ${local + 1}`),
                        id: monitor,
                        num: local,
                        localID: local,
                        type: 'none'
                    }

                    if (monitors[hwid[2]] == undefined) {
                        // Monitor not in list
                        monitors[hwid[2]] = {
                            id: monitor,
                            key: hwid[2],
                            num: false,
                            brightness: 50,
                            brightnessMax: 100,
                            brightnessRaw: 50,
                            type: 'none',
                            min: 0,
                            max: 100,
                            hwid: false,
                            name: "Unknown Display",
                            serial: false
                        }
                    } else {
                        if (monitors[hwid[2]].name) {
                            // Monitor is in list
                            ddcciInfo.name = monitors[hwid[2]].name
                        }
                    }

                    // Determine features
                    if (monitors[hwid[2]].features === undefined || type == "features" || type == "features-only") {
                        ddcciInfo.features = {
                            luminance: checkVCPIfEnabled(monitor, 0x10, "luminance"),
                            brightness: checkVCPIfEnabled(monitor, 0x13, "brightness"),
                            gain: (checkVCPIfEnabled(monitor, 0x16, "gain") && checkVCPIfEnabled(monitor, 0x18, "gain") && checkVCPIfEnabled(monitor, 0x1A, "gain")),
                            contrast: checkVCPIfEnabled(monitor, 0x12, "contrast"),
                            powerState: checkVCPIfEnabled(monitor, 0xD6, "powerState"),
                            volume: checkVCPIfEnabled(monitor, 0x62, "volume")
                        }
                    } else {
                        ddcciInfo.features = monitors[hwid[2]].features
                    }


                    if (type != "features-only") {
                        // Determine / get brightness
                        let brightnessValues = [50, 100] // current, max
                        let brightnessType = 0x00
                        if (ddcciInfo.features.luminance) {
                            brightnessValues = checkVCP(monitor, 0x10)
                            brightnessType = 0x10
                        } else if (ddcciInfo.features.brightness) {
                            brightnessValues = checkVCP(monitor, 0x13)
                            brightnessType = 0x13
                        }

                        // If something goes wrong and there are previous values, use those
                        if (!brightnessValues) {
                            console.log("\x1b[41mNO BRIGHTNESS VALUES AVAILABLE\x1b[0m")
                            if (monitors[hwid[2]].brightness !== undefined && monitors[hwid[2]].brightnessMax !== undefined) {
                                console.log("\x1b[41mUSING PREVIOUS VALUES\x1b[0m")
                                brightnessValues = [normalizeBrightness(monitors[hwid[2]].brightness, false, ddcciInfo.min, ddcciInfo.max), monitors[hwid[2]].brightnessMax]
                            } else if(vcpCache[monitor] && vcpCache[monitor]["vcp_" + 0x10]) {
                                console.log("\x1b[41mUSING VCP CACHE\x1b[0m")
                                brightnessValues = vcpCache[monitor]["vcp_" + 0x10];
                            } else {
                                console.log("CATASTROPHIC FAILURE",
                                    monitors[hwid[2]])
                                // Catastrophic failure. Revert to defaults.
                                brightnessValues = [50, 100]
                            }
                        }

                        ddcciInfo.brightness = brightnessValues[0] * (100 / (brightnessValues[1] || 100))
                        ddcciInfo.brightnessMax = (brightnessValues[1] || 100)
                        ddcciInfo.brightnessRaw = ddcciInfo.brightness // Raw value from DDC/CI. Not normalized or adjusted.
                        ddcciInfo.brightnessType = brightnessType

                        // Get normalization info
                        ddcciInfo = applyRemap(ddcciInfo)
                        // Unnormalize brightness
                        ddcciInfo.brightness = normalizeBrightness(ddcciInfo.brightness, true, ddcciInfo.min, ddcciInfo.max)
                    }

                    // Only display as DDC/CI display if brightness support is detected
                    if(ddcciInfo.brightnessType) {
                        ddcciInfo.type = 'ddcci';
                        Object.assign(monitors[hwid[2]], ddcciInfo)
                    }

                    ddcciList.push(ddcciInfo)

                    local++
                } catch (e) {
                    // Probably failed to get VCP code, which means the display is not compatible
                    // No need to yell about it...
                }
            }
            resolve(ddcciList)

        } catch (e) {
            // ...but we should yell about this.
            console.log(e)
            resolve(ddcciList)
        }

    })

}

refreshWMI = async () => {
    // Request WMI monitors.
    return new Promise((resolve, reject) => {
        let local = 0
        let wmiList = []
        try {
            const monitor = wmibridge.getBrightness();
            if (monitor.failed) {
                // Something went wrong
                resolve([])
            } else {
                let hwid = readInstanceName(monitor.InstanceName)
                hwid[2] = hwid[2].split("_")[0]

                let wmiInfo = {
                    name: makeName(hwid[2], `${localization.GENERIC_DISPLAY_SINGLE} ${local + 1}`),
                    id: monitor.InstanceName,
                    num: local,
                    localID: local,
                    brightness: monitor.Brightness,
                    brightnessMax: 100,
                    brightnessRaw: -1,
                    type: 'wmi',
                    min: 0,
                    max: 100
                }
                local++

                if (monitors[hwid[2]] == undefined) {
                    monitors[hwid[2]] = {
                        id: monitor.InstanceName,
                        key: hwid[2],
                        num: false,
                        brightness: 50,
                        brightnessMax: 100,
                        brightnessRaw: 50,
                        type: 'none',
                        min: 0,
                        max: 100,
                        hwid: false,
                        name: "Unknown Display",
                        serial: false
                    }
                } else {
                    if (monitors[hwid[2]].name) {
                        wmiInfo.name = monitors[hwid[2]].name
                    }
                        
                }

                // Get normalization info
                wmiInfo = applyRemap(wmiInfo)
                // Unnormalize brightness
                wmiInfo.brightnessRaw = wmiInfo.brightness
                wmiInfo.brightness = normalizeBrightness(wmiInfo.brightness, true, wmiInfo.min, wmiInfo.max)

                wmiList.push(wmiInfo)
                Object.assign(monitors[hwid[2]], wmiInfo)
                resolve(wmiList)
            }
        } catch (e) {
            debug.log(e)
            resolve([])
        }
    })

}


function setBrightness(brightness, id) {
    try {
        if (id) {
            let monitor = Object.values(monitors).find(mon => mon.id == id)
            monitor.brightness = brightness
            ddcci.setBrightness(id, brightness)
        } else {
            let monitor = Object.values(monitors).find(mon => mon.type == "wmi")
            monitor.brightness = brightness
            wmibridge.setBrightness(brightness);
        }
    } catch (e) {
        console.log("Couldn't update brightness!");
        console.log(e)
    }
}

let vcpCache = {}
function checkVCPIfEnabled(monitor, code, setting, skipCache = false) {
    try {
        // If we previously saw that a feature was supported, we shouldn't have to check again.
        if (!skipCache && vcpCache[monitor] && vcpCache[monitor]["vcp_" + code]) return vcpCache[monitor]["vcp_" + code];

        const vcpResult = checkVCP(monitor, code)
        return vcpResult
    } catch(e) {
        console.log(e)
        return false
    }
}

function checkVCP(monitor, code, skipCacheWrite = false) {
    try {
        let result = ddcci._getVCP(monitor, code)
        if(!skipCacheWrite) {
            if(!vcpCache[monitor]) vcpCache[monitor] = {};
            vcpCache[monitor]["vcp_" + code] = result
        }
        return result
    } catch (e) {
        return false
    }
}

function setVCP(monitor, code, value) {
    try {
        return ddcci._setVCP(monitor, code, value)
    } catch (e) {
        return false
    }
}


function makeName(monitorDevice, fallback) {
    if(namesCache[monitorDevice] !== undefined) {
        return namesCache[monitorDevice]
    } else if (monitorNames[monitorDevice] !== undefined) {
        return monitorNames[monitorDevice]
    } else {
        return fallback;
    }
}

function getCleanList(fullList, filterKeys) {
    let monitors = Object.assign(fullList, {})
    // Delete disconnected displays
    for (let key in monitors) {
        if (filterKeys && !filterKeys.includes(key)) delete monitors[key];
    }
    return monitors
}

function normalizeBrightness(brightness, unnormalize = false, min = 0, max = 100) {
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


function readInstanceName(insName) {
    return insName.replace(/&amp;/g, '&').split("\\")
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
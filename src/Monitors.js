const { exec } = require('child_process');
const w32disp = require("win32-displayconfig");


process.on('message', (data) => {
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
    }
})

let debug = console

let isDev = (process.argv.indexOf("--isdev=true") >= 0)

let monitors = {}
let monitorNames = []

let settings = { order: [] }
let localization = {}

refreshMonitors = async (fullRefresh = false, ddcciType = "default", alwaysSendUpdate = false) => {
    const startTime = process.hrtime()

    try {
        let doWMI = true
        let doDDCCI = true

        if(refreshWMI) monitors = {};

        if (settings.useRefreshNamesWin32) {

            // Get info on all displays
            const namesPromise = refreshNamesWin32()
            monitorNames = await namesPromise
            namesPromise.then(() => { console.log(`NAMES done in ${process.hrtime(startTime)[1] / 1000000}ms`) })

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

    console.log(`Total: ${process.hrtime(startTime)[1] / 1000000}ms`)
    return monitors;
}


//
//
//    Get monitor names
//
//

refreshNames = () => {

    return new Promise((resolve, reject) => {
        getWMI();
        wmi.query('SELECT * FROM WmiMonitorID', function (err, result) {
            let foundMonitors = []
            if (err != null) {
                resolve([])
            } else if (result) {
                // Apply names

                for (let monitor of result) {
                    let hwid = readInstanceName(monitor.InstanceName)
                    hwid[2] = hwid[2].split("_")[0]
                    const wmiInfo = {
                        hwid: hwid,
                        serial: parseWMIString(monitor.SerialNumberID)
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

                    if (monitor.UserFriendlyName !== null)
                        wmiInfo.name = parseWMIString(monitor.UserFriendlyName)

                    Object.assign(monitors[hwid[2]], wmiInfo)

                }

                resolve(foundMonitors)
            } else {
                resolve(foundMonitors)
            }
        });
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

                if (monitor.monitorFriendlyDeviceName.length > 0)
                    monitors[hwid[2]].name = monitor.monitorFriendlyDeviceName;

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

                    let ddcciInfo = {
                        name: makeName(monitor, `${localization.GENERIC_DISPLAY_SINGLE} ${local + 1}`),
                        id: monitor,
                        num: local,
                        localID: local,
                        type: 'ddcci'
                    }

                    const hwid = monitor.split("#")
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
                                brightnessValues = [normalizeBrightness(monitors[hwid[2]].brightness, false, ddcciInfo.min, ddcciInfo.max), monitors[hwid[2]].brightnessMax]
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

                    ddcciList.push(ddcciInfo)
                    Object.assign(monitors[hwid[2]], ddcciInfo)

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
            getWMI();
            wmi.query('SELECT * FROM WmiMonitorBrightness', function (err, result) {
                if (err != null) {
                    resolve([])
                } else if (result) {

                    for (let monitor of result) {

                        let wmiInfo = {
                            name: makeName(monitor.InstanceName, `${localization.GENERIC_DISPLAY_SINGLE} ${local + 1}`),
                            id: monitor.InstanceName,
                            num: local,
                            localID: local,
                            brightness: monitor.CurrentBrightness,
                            brightnessMax: 100,
                            brightnessRaw: -1,
                            type: 'wmi',
                            min: 0,
                            max: 100
                        }
                        local++

                        let hwid = readInstanceName(monitor.InstanceName)
                        hwid[2] = hwid[2].split("_")[0]
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
                            if (monitors[hwid[2]].name)
                                wmiInfo.name = monitors[hwid[2]].name
                        }

                        // Get normalization info
                        wmiInfo = applyRemap(wmiInfo)
                        // Unnormalize brightness
                        wmiInfo.brightnessRaw = wmiInfo.brightness
                        wmiInfo.brightness = normalizeBrightness(wmiInfo.brightness, true, wmiInfo.min, wmiInfo.max)

                        wmiList.push(wmiInfo)
                        Object.assign(monitors[hwid[2]], wmiInfo)

                    }
                    resolve(wmiList)
                } else {
                    reject(wmiList)
                }
            });

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
            exec(`powershell.exe (Get-WmiObject -Namespace root\\wmi -Class WmiMonitorBrightnessMethods).wmisetbrightness(0, ${brightness})`)
        }
    } catch (e) {
        console.log("Couldn't update brightness!");
        console.log(e)
    }
}

let vcpCache = {}
function checkVCPIfEnabled(monitor, code, setting = "feature_name", skipCache = false) {
    if (settings.features[setting]) {

        // If we previously saw that a feature was supported, we shouldn't have to check again.
        if (!skipCache && vcpCache[monitor] && vcpCache[monitor][setting]) return vcpCache[monitor][setting];

        const vcpResult = checkVCP(monitor, code)

        if (!vcpCache[monitor]) vcpCache[monitor] = {};
        vcpCache[monitor][setting] = vcpResult;

        return vcpResult
    }
    return false
}

function checkVCP(monitor, code) {
    try {
        return ddcci._getVCP(monitor, code)
    } catch (e) {
        return false
    }
}


function makeName(monitorDevice, fallback) {
    if (monitorNames[monitorDevice] !== undefined) {
        return monitorNames[monitorDevice]
    } else {
        return fallback;
    }
}

function getCleanList(fullList, filterKeys) {
    let monitors = Object.assign(fullList, {})
    // Delete disconnected displays
    for (let key in monitors) {
        if (!filterKeys.includes(key)) delete monitors[key];
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


let wmi = false
function getWMI() {
    if (wmi) return true;
    let WmiClient = false
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
        return false;
    }
}
getWMI();
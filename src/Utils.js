const path = require('path');
const fs = require('fs')

function udpSendCommand(type, data, port = 14715, key) {
    return new Promise((resolve, reject) => {
        const client = require('dgram').createSocket('udp4')
        const udpTimeout = setTimeout(() => {
            clearTimeout(udpTimeout)
            reject("No response")
        }, 1000)

        client.on('message', (message, connection) => {
            resolve(message?.toString())
        })

        client.send(JSON.stringify({ type, data, key }), port, "localhost", err => {
            if (err) {
                reject('Failed to send command')
            }
        })
    })
}

function pipeSendCommand(type, data, port = 14715, key) {
    return new Promise((resolve, reject) => {
        const cmdTimeout = setTimeout(() => {
            clearTimeout(cmdTimeout)
            reject("No response")
        }, 1000)

        const client = require('net').connect('\\\\.\\pipe\\twinkle-tray\\cmds')

        client.on('data', function(message) {
            resolve(message?.toString())
        })

        try {
            client.write(JSON.stringify({ type, data, key }))
        } catch(e) {
            reject('Failed to send command:', e)
        }
    })
}

module.exports = {
    unloadModule: (name) => {
        try {
            if (require.cache[require.resolve(name)]) {
                delete require.cache[require.resolve(name)]
                console.log(`Unloaded module: ${name}`)
            }
        } catch (e) {
            console.log(`Couldn't unload module: ${name}`)
        }
    },
    wait(ms = 2000) {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(true);
            }, ms);
        });
    },
    processArgs: (commandLine) => {

        let validArgs = {}

        commandLine.forEach(argRaw => {

            const arg = argRaw.toLowerCase();

            // Use UDP
            if (arg.indexOf("--udp") === 0) {
                validArgs.UseUDP = true
            }

            // Get display by index
            if (arg.indexOf("--list") === 0) {
                validArgs.List = true
            }

            // Get display by index
            if (arg.indexOf("--monitornum=") === 0) {
                validArgs.MonitorNum = (arg.substring(13) * 1)
            }

            // Get display by ID (partial or whole)
            if (arg.indexOf("--monitorid=") === 0) {
                validArgs.MonitorID = arg.substring(12)
            }

            // Run on all displays
            if (arg.indexOf("--all") === 0 && arg.length === 5) {
                validArgs.All = true
            }

            // Use absolute brightness
            if (arg.indexOf("--set=") === 0) {
                validArgs.Brightness = (arg.substring(6) * 1)
                validArgs.BrightnessType = "set"
            }

            // Use relative brightness
            if (arg.indexOf("--offset=") === 0) {
                validArgs.Brightness = (arg.substring(9) * 1)
                validArgs.BrightnessType = "offset"
            }

            // Use time adjustments
            if (arg.indexOf("--usetime") === 0) {
                validArgs.UseTime = true
            }

            // DDC/CI command
            if (arg.indexOf("--vcp=") === 0 && arg.indexOf(":")) {
                validArgs.VCP = true
            }

            // Show overlay
            if (arg.indexOf("--overlay") === 0) {
                validArgs.ShowOverlay = true
            }

            // Show panel
            if (arg.indexOf("--panel") === 0) {
                validArgs.ShowPanel = true
            }

        })

        return validArgs
    },

    async handleProcessedArgs(args = {}, knownDisplaysPath, settingsPath) {

        let failed
        const settings = JSON.parse(fs.readFileSync(settingsPath))

        if (args.ShowPanel) {
            console.log(`Showing panel`)
        } else if (args.List) {
            //const displays = getKnownDisplays(knownDisplaysPath)

            const useUDP = (args.UseUDP ? true : false)
            const response = await (useUDP ? udpSendCommand : pipeSendCommand)("list", false, settings.udpPortActive, settings.udpKey)
            let displays = {}
            try {
                displays = JSON.parse(response || "")
            } catch(e) {
                console.log("Error parsing response")
            }

            Object.values(displays).forEach(display => {
                console.log(`
\x1b[36mMonitorNum:\x1b[0m ${display.num}
\x1b[36mMonitorID:\x1b[0m ${display.key}
\x1b[36mName:\x1b[0m ${display.name}
\x1b[36mBrightness:\x1b[0m ${display.brightness}
\x1b[36mType:\x1b[0m ${display.type}`)
            })

            failed = false;
            return true;
        } else {
            if (!(args.MonitorID !== undefined || args.MonitorNum !== undefined || args.All || args.UseTime)) {
                console.log("\x1b[41mMissing monitor argument.\x1b[0m")
                failed = true
            }
            if (args.Brightness === undefined && !args.VCP && !args.UseTime) {
                console.log("\x1b[41mMissing brightness argument.\x1b[0m")
                failed = true
            }
        }

        if (failed) {
            console.log(`
Supported args:

\x1b[36m--List\x1b[0m
List all displays.

\x1b[36m--MonitorNum\x1b[0m
Select monitor by number. Starts at 1.
\x1b[2mExample: --MonitorNum=2\x1b[0m

\x1b[36m--MonitorID\x1b[0m
Select monitor by internal ID. Partial or whole matches accepted.
\x1b[2mExample: --MonitorID="UID2353"\x1b[0m

\x1b[36m--All\x1b[0m
Flag to update all monitors.
\x1b[2mExample: --All\x1b[0m

\x1b[36m--Set\x1b[0m
Set brightness percentage.
\x1b[2mExample: --Set=95\x1b[0m

\x1b[36m--Offset\x1b[0m
Adjust brightness percentage.
\x1b[2mExample: --Offset=-20\x1b[0m

\x1b[36m--UseTime\x1b[0m
Adjust brightness using Time of Day Adjustments. 
\x1b[2mExample: --UseTime\x1b[0m

\x1b[36m--VCP\x1b[0m
Send a specific DDC/CI VCP code and value instead of brightness. The first part is the VCP code (decimal or hexadecimal), and the second is the value.
\x1b[2mExample: --VCP="0xD6:5"\x1b[0m

\x1b[36m--Overlay\x1b[0m
Flag to show brightness levels in the overlay
\x1b[2mExample: --Overlay\x1b[0m

\x1b[36m--Panel\x1b[0m
Flag to show brightness levels in the panel
\x1b[2mExample: --Panel\x1b[0m
`)
        } else {
            console.log("OK")
        }
    },
    vcpMap: {
        0x10: "luminance",
        0x13: "brightness",
        0x12: "contrast",
        0xD6: "powerState",
        0x62: "volume"
    },
    upgradeAdjustmentTimes,
    getVersionValue,
    lerp,
    parseTime,
    getCalibratedValue
}


function upgradeAdjustmentTimes(times = []) {
    const newTimes = []

    times.forEach(time => {
        if (time.time) {
            newTimes.push(time)
            return
        }

        const newTime = {
            brightness: (time.brightness ? time.brightness : 50),
            monitors: (time.monitors ? time.monitors : 50),
            time: "00:00"
        }

        // Convert to 24H
        const hourInt = parseInt(time.hour)
        const fixedHour = hourInt + (hourInt == 12 ? (time.am.toLowerCase() == "pm" ? 0 : -12) : (time.am.toLowerCase() == "pm" ? 12 : 0))
        newTime.time = (fixedHour < 10 ? "0" + fixedHour : fixedHour) + ":" + (time.minute < 10 ? "0" + time.minute : time.minute)

        newTimes.push(newTime)
    })

    return newTimes
}

// Convert version to a numeric value (v1.2.3 = 10020003)
function getVersionValue(version = 'v1.0.0') {
    let out = version.split('-')[0].replace("v", "").split(".")
    out = (out[0] * 10000 * 10000) + (out[1] * 10000) + (out[2] * 1)
    return parseInt(out)
}

function lerp(start, finish, perc) {
    return start * (1 - perc) + finish * perc
}

function parseTime(time) {
    return parseInt((time.split(":")[0] * 60) + (time.split(":")[1] * 1))
}

// Get known displays from file, along with current displays
function getKnownDisplays(knownDisplaysPath) {
    let known
    try {
        // Load known displays DB
        known = fs.readFileSync(knownDisplaysPath)
        known = JSON.parse(known)
    } catch (e) {
        known = {}
    }

    return known
}

/**
 * Maps a value (0–100) using calibration points.
 * By default, maps input to output. Can also reverse map output back to input.
 *
 * @param {number} value - The value to map (expected range: 0–100).
 * @param {Array<{input: number, output: number}>} calibrationPoints - 
 *        An array of calibration points.
 *        Example: [{input: 15, output: 30}, {input: 50, output: 60}]
 * @param {boolean} reverse - If true, maps output to input. Default is false (input to output).
 * @returns {number} - The mapped value.
 */
function getCalibratedValue(value, calibrationPoints = [], reverse = false) {
    // Ensure value is within 0–100
    value = Math.max(0, Math.min(100, value));

    // Add default start and end points if not provided
    const points = calibrationPoints.slice();

    // Handle min/max values if those points haven't been provided
    let hasMin = false;
    let hasMax = false;
    for (const point of points) {
        point.input = Math.max(0, Math.min(100, point.input));
        if (point.input === 0) hasMin = true;
        if (point.input === 100) hasMax = true;
    }

    if (!hasMin) {
        points.unshift({ input: 0, output: 0 });
    }
    if (!hasMax) {
        points.push({ input: 100, output: 100 });
    }

    // Sort points by input value
    points.sort((a, b) => a.input - b.input);

    if (reverse) {
        // Reverse mapping: output -> input
        // Find the two points between which the output falls
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];

            // Check if output falls between these two points
            const minOutput = Math.min(p1.output, p2.output);
            const maxOutput = Math.max(p1.output, p2.output);

            if (value >= minOutput && value <= maxOutput) {
                // Linear interpolation in reverse
                if (p2.output === p1.output) {
                    // If outputs are the same, return the midpoint input
                    return (p1.input + p2.input) / 2;
                }
                const ratio = (value - p1.output) / (p2.output - p1.output);
                return p1.input + ratio * (p2.input - p1.input);
            }
        }
        // Fallback
        return value;
    } else {
        // Forward mapping: input -> output
        if (value === 0 && points.length > 0 && points[0].input === 0) {
            return points[0].output;
        }

        // Find the two points between which the input falls
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];

            if (value >= p1.input && value <= p2.input) {
                // Linear interpolation
                const ratio = (value - p1.input) / (p2.input - p1.input);
                return p1.output + ratio * (p2.output - p1.output);
            }
        }
        // Fallback
        return value;
    }
}
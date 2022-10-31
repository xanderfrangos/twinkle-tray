const path = require('path');
const fs = require('fs')

module.exports = {
    unloadModule: (name) => {
        try {
            delete require.cache[require.resolve(name)];
            console.log(`Unloaded module: ${name}`)
        } catch(e) {
            console.log(`Couldn't unload module: ${name}`)
        }
    },
    processArgs: (commandLine) => {

        let validArgs = {}

        commandLine.forEach(argRaw => {

            const arg = argRaw.toLowerCase();

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

            // DDC/CI command
            if (arg.indexOf("--vcp=") === 0 && arg.indexOf(":")) {
                validArgs.VCP = true
            }

            // Show overlay
            if (arg.indexOf("--overlay") === 0) {
                validArgs.ShowOverlay = true
            }

        })

        return validArgs
    },

    handleProcessedArgs(args = {}, knownDisplaysPath) {

        let failed

        if(args.List) {
            const displays = getKnownDisplays(knownDisplaysPath)
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
            if (!(args.MonitorID !== undefined || args.MonitorNum !== undefined || args.All)) {
                console.log("\x1b[41mMissing monitor argument.\x1b[0m")
                failed = true
            }
            if (args.Brightness === undefined && !args.VCP) {
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

\x1b[36m--VCP\x1b[0m
Send a specific DDC/CI VCP code and value instead of brightness. The first part is the VCP code (decimal or hexadecimal), and the second is the value.
\x1b[2mExample: --VCP="0xD6:5"\x1b[0m

\x1b[36m--Overlay\x1b[0m
Flag to show brightness levels in the overlay
\x1b[2mExample: --Overlay\x1b[0m
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
    }
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
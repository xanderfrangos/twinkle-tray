module.exports = {
    processArgs: (commandLine) => {

        let validArgs = {}

        commandLine.forEach(argRaw => {

            const arg = argRaw.toLowerCase();

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

            // Show overlay
            if (arg.indexOf("--overlay") === 0) {
                validArgs.ShowOverlay = true
            }

        })

        return validArgs
    },

    handleProcessedArgs(args = {}) {

        let failed
        if (!(args.MonitorID || args.MonitorNum || args.All)) {
            console.log("\x1b[41mMissing monitor argument.\x1b[0m")
            failed = true
        }
        if (!(args.Brightness)) {
            console.log("\x1b[41mMissing brightness argument.\x1b[0m")
            failed = true
        }

        if (failed) {
            console.log(`
Supported args:

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

\x1b[36m--Overlay\x1b[0m
Flag to show brightness levels in the overlay
\x1b[2mExample: --Overlay\x1b[0m
`)
        } else {
            console.log("OK")
        }
    }
}
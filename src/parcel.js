const ParcelAPI = require("./parcelAPI")

let mode
let logLevel
try {
    let modeFlagPos = (process.argv.indexOf("--mode"))
    mode = (process.argv[modeFlagPos + 1])
} catch(e) {
    console.log("Couldn't read mode flag.", e)
}
try {
    let logFlagPos = (process.argv.indexOf("--logLevel"))
    logLevel = (process.argv[logFlagPos + 1])
} catch(e) {
    console.log("Couldn't read log flag.", e)
}
ParcelAPI(mode, logLevel)
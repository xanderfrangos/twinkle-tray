console.log("\x1b[45mRunning wmi-bridge test...\x1b[0m")
const wmibridge = require("wmi-bridge");
require("os").setPriority(0, require("os").constants.priority.PRIORITY_BELOW_NORMAL)

function readInstanceName(insName) {
    return (insName ? insName.replace(/&amp;/g, '&').split("\\") : undefined)
}

// For testing timeouts
function wait4s() {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(true);
        }, 4000);
    });
}

getMonitorsWMI = () => {
    return new Promise(async (resolve, reject) => {
        const foundMonitors = {}
        try {
            const wmiMonitors = await wmibridge.getMonitors();

            if (wmiMonitors.failed) {
                // Something went wrong
                console.log("\x1b[41m" + "wmi-bridge-test: Recieved FAILED response from getMonitors()" + "\x1b[0m")
                reject(foundMonitors)
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
            }
        } catch (e) {
            console.log(`wmi-bridge-test: Failed to get all monitors.`)
            console.log(e)
        }
        resolve(foundMonitors)
    })
}



process.send({
    type: 'ready'
})

//wait4s().then(() => { })
getMonitorsWMI().then(() => {
    process.send({ type: 'ok' })
}).catch(() => {
    process.send({ type: 'failed' })
})
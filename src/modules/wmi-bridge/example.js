const WMIBridgeTest = require("./index");

setInterval(() => {
    console.log("==== TESTING WMIBRIDGE ====")
    const monitors = WMIBridgeTest.getMonitors();
    console.log(`getMonitors: ${Object.keys(monitors)}`)

    const brightness = WMIBridgeTest.getBrightness();
    console.log(`getBrightness:`, brightness)

    const ok = WMIBridgeTest.setBrightness(100);
    console.log(`setBrightness: ${ok}`)
    console.log('===========================')
    console.log(" ")
    console.log(" ")
}, 500)
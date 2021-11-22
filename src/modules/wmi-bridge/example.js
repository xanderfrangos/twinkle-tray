const WMIBridgeTest = require("./index");

const brightness = WMIBridgeTest.getBrightness();
const ok = WMIBridgeTest.setBrightness(100);
const monitors = WMIBridgeTest.getMonitors();

console.log(monitors, brightness, ok);
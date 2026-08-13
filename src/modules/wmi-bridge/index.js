"use strict";
const addon = require("bindings")("wmi_bridge");
require("os").setPriority(0, require("os").constants.priority.PRIORITY_BELOW_NORMAL)

class WMIBridge {
    constructor() {}
    setBrightness = async (level = 50) => {
        let ok = false
        try {
            ok = addon.setBrightness(level)
        } catch(e) { console.log(e) }
        return ok
    }
    getBrightness = async () => {
        let brightness = { failed: true }
        try {
            brightness = addon.getBrightness()
        } catch (e) { console.log(e) }
        return brightness
    }
    getMonitors = async () => {
        try {
            return addon.getMonitors()
        } catch(e) {
            console.log(e)
            return { failed: true }
        }
    }
    // Calls back with { InstanceName, Brightness, Active } whenever the
    // internal display's brightness changes (including changes made
    // outside this process).
    startBrightnessWatcher = (callback) => {
        let ok = false
        try {
            ok = addon.startBrightnessWatcher((event) => {
                try { callback(event) } catch(e) { console.log(e) }
            })
        } catch(e) { console.log(e) }
        return ok
    }
    stopBrightnessWatcher = () => {
        let ok = false
        try {
            ok = addon.stopBrightnessWatcher()
        } catch(e) { console.log(e) }
        return ok
    }
}

module.exports = new WMIBridge();
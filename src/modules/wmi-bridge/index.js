"use strict";
const addon = require("bindings")("wmi_bridge");

class WMIBridge {
    constructor() {}
    setBrightness(level = 50) {
        let ok = false
        try {
            ok = addon.setBrightness(level)
        } catch(e) {
            console.log("\x1b[41m" + "setBrightness() failed!" + "\x1b[0m", e)
         }
        return ok
    }
    getBrightness() {
        let brightness = { failed: true }
        try {
            brightness = addon.getBrightness()
        } catch(e) {
            console.log("\x1b[41m" + "getBrightness() failed!" + "\x1b[0m", e)
         }
        return brightness
    }
    getMonitors() {
        try {
            return addon.getMonitors()
        } catch(e) {
            console.log("\x1b[41m" + "getMonitors() failed!" + "\x1b[0m", e)
            return { failed: true }
        }
    }
}

module.exports = new WMIBridge();
"use strict";
const addon = require("bindings")("wmi_bridge");

class WMIBridge {
    constructor() {}
    setBrightness(level = 50) {
        let ok = false
        try {
            ok = addon.setBrightness(level)
        } catch(e) { }
        return ok
    }
    getBrightness() {
        let brightness = { failed: true }
        try {
            brightness = addon.getBrightness()
        } catch(e) { }
        return brightness
    }
    getMonitors() {
        return addon.getMonitors()
    }
}

module.exports = new WMIBridge();
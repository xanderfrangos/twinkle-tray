"use strict";
const addon = require("bindings")("wmi_bridge");

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
}

module.exports = new WMIBridge();
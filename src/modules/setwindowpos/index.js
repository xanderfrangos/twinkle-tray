"use strict";
const addon = require("bindings")("setwindowpos");
module.exports = {
    setWindowPos: addon.setWindowPos,
    getWindowPos: addon.getWindowPos,
    getClientPos: addon.getClientPos,
    getClientPos: addon.getClientPos,
    setForegroundWindow: addon.setForegroundWindow,
    getForegroundWindow: addon.getForegroundWindow,
    getWindowLong: addon.getWindowLong,
    getWindowFullscreen: addon.getWindowFullscreen
}
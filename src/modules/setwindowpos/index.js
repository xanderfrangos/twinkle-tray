"use strict";
const addon = require("bindings")("setwindowpos");
module.exports = {
    setWindowPos: addon.setWindowPos,
    setForegroundWindow: addon.setForegroundWindow,
    getForegroundWindow: addon.getForegroundWindow,
    setWindowLong: addon.setWindowLong,
    getWindowLong: addon.getWindowLong,
    setWindowRgn: addon.setWindowRgn,
    setParentWindow: addon.setParentWindow,
    createWindow: addon.createWindow,
    setBackdrop: addon.setBackdrop
}
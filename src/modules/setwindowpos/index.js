"use strict";
const addon = require("bindings")("setwindowpos");
module.exports = {
    setWindowPos: addon.setWindowPos,
    setForegroundWindow: addon.setForegroundWindow,
    getForegroundWindow: addon.getForegroundWindow
}
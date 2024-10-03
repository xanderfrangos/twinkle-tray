"use strict";
const addon = require("bindings")("windows-hdr");
module.exports = {
    getDisplays: addon.getDisplays,
    setSDRBrightness: addon.setSDRBrightness
}
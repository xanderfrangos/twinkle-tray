"use strict";

const ddcci = require("bindings")("ddcci");

module.exports = {
    _getVCP: ddcci.getVCP
  , _setVCP: ddcci.setVCP
  , _refresh: ddcci.refresh
  , getMonitorList: ddcci.getMonitorList


  , getBrightness (monitor) {
        return ddcci.getVCP(monitor, 0x10);
    }

  , getContrast (monitor) {
        return ddcci.getVCP(monitor, 0x12);
    }

  , setBrightness (monitor, level) {
        if (level < 0 || level > 100) {
            throw RangeError("Brightness level not within valid range");
        }

        ddcci.setVCP(monitor, 0x10, level);
    }

  , setContrast (monitor, level) {
        if (level < 0 || level > 100) {
            throw RangeError("Contrast level not within valid range");
        }

        ddcci.setVCP(monitor, 0x12, level);
    }
};


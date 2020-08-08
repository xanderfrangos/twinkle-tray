"use strict";

const ddcci = require("bindings")("ddcci");

module.exports = {
    _getVCP: ddcci.getVCP
  , _setVCP: ddcci.setVCP
  , _refresh: ddcci.refresh
  , getMonitorList: ddcci.getMonitorList


  , getBrightness (monitor) {
        return ddcci.getVCP(monitor, 0x10)[0];
    }

  , getMaxBrightness (monitor) {
        return ddcci.getVCP(monitor, 0x10)[1];
    }

  , getContrast (monitor) {
        return ddcci.getVCP(monitor, 0x12)[0];
    }

  , getMaxContrast (monitor) {
        return ddcci.getVCP(monitor, 0x12)[1];
    }

  , setBrightness (monitor, level) {
        if (level < 0) {
            throw RangeError("Brightness level not within valid range");
        }

        ddcci.setVCP(monitor, 0x10, level);
    }

  , setContrast (monitor, level) {
        if (level < 0) {
            throw RangeError("Contrast level not within valid range");
        }

        ddcci.setVCP(monitor, 0x12, level);
    }
};


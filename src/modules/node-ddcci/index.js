"use strict";

const ddcci = require("bindings")("ddcci");
const vcp = require("./vcp");

module.exports = {
    vcp

  , _getVCP: ddcci.getVCP
  , _setVCP: ddcci.setVCP
  , _saveCurrentSettings: ddcci.saveCurrentSettings
  , _getAllMonitors: ddcci.getAllMonitors
  , _clearDisplayCache: ddcci.clearDisplayCache
  , _setLogLevel: ddcci.setLogLevel
  , _parseCapabilitiesString: parseCapabilitiesString
  , _refresh: (method = "accurate", usePreviousResults = true) => ddcci.refresh(method, usePreviousResults)
  , getMonitorList: (method = "accurate", usePreviousResults = true) => { 
        ddcci.refresh(method, usePreviousResults);
        return ddcci.getMonitorList();
    }
  , getAllMonitors: (method = "accurate", usePreviousResults = true) => { 
        ddcci.refresh(method, usePreviousResults);
        const monitors = ddcci.getAllMonitors();
        for(const monitor of monitors) {
            if(monitor.result && monitor.result != "ok" && monitor.result != "invalid") {
                monitor.capabilities = parseCapabilitiesString(monitor.result);
                monitor.capabilitiesRaw = monitor.result;
            }
            delete monitor.result;
        }
        return monitors;
    }

  , getVCP: ddcci.getVCP
  , setVCP: ddcci.setVCP

  , getBrightness (monitorId) {
        return ddcci.getVCP(monitorId, vcp.LUMINANCE)[0];
    }

  , getMaxBrightness (monitorId) {
        return ddcci.getVCP(monitorId, vcp.LUMINANCE)[1];
    }

  , getContrast (monitorId) {
        return ddcci.getVCP(monitorId, vcp.CONTRAST)[0];
    }

  , getMaxContrast (monitorId) {
        return ddcci.getVCP(monitorId, vcp.CONTRAST)[1];
    }

  , setBrightness (monitorId, level) {
        if (level < 0) {
            throw RangeError("Brightness level not within valid range");
        }

        ddcci.setVCP(monitorId, vcp.LUMINANCE, level);
    }

  , setContrast (monitorId, level) {
        if (level < 0) {
            throw RangeError("Contrast level not within valid range");
        }

        ddcci.setVCP(monitorId, vcp.CONTRAST, level);
    }

    // Returns an array where keys are valid VCP codes and the keys are an array of accepted values.
    // If the array of accepted values is empty, the VCP code either accepts a range of values or no values. Use getVCP to determine the range, if any.
  , getCapabilities (monitorId) {
        let report = ddcci.getCapabilitiesString(monitorId);
        return parseCapabilitiesString(report);
    }
  , getCapabilitiesRaw (monitorId) {
        return ddcci.getCapabilitiesString(monitorId);
  }
};

function parseCapabilitiesString(report = "") {
    const start = report.indexOf('vcp('); // Find where VCP list starts

    // Only run if VCP list found
    if(start > 0) {
        let layers = 1;
        let output = "";
        let position = start + 4;

        // Iterate through report string after the start of the list until we hit the end.
        // We'll check for nested parenthesis to correctly find the end of the list.
        while(layers > 0 && position + 1 < report.length) {
            const char = report[position];
            if(char === "(") {
                layers++;
            } else if(char === ")") {
                layers--;
                if(layers <= 0) break;
            }
            output += char;
            position++;
        }

        // Strip out unnecessary characters
        output = output.replaceAll('\0', '').replaceAll(' ', '').trim();

        // Iterate through the above string, alternating between parsing VCP codes and accepted values as needed
        const codeList = {};

        let pos = 0
        while(pos < output.length){
            const cur = output[pos]
            pos++
            if(cur !== "(") {
                let vcpCode = `${cur}${output[pos]}`
                const vcpValues = []
                pos++
                if(output[pos] == "(") {
                    pos++
                    while(output[pos] != ")" && pos < output.length) {
                        vcpValues.push(parseInt(`0x${output[pos]}${output[pos+1]}`))
                        pos += 2
                    }
                    pos++
                }
                codeList[`0x${vcpCode.toUpperCase()}`] = vcpValues
            }
        }

        return codeList
    }
    return false;
}
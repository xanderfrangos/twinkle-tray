"use strict";
const WindowsAmbientSensor = require("bindings")("windows_ambient_sensor");

module.exports = {
    getAmbientLightSensors: WindowsAmbientSensor.getAmbientLightSensors,
    getLuxValue: WindowsAmbientSensor.getLuxValue,
}

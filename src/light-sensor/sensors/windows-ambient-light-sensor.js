const { applyMonitorBRightnessFromLux } = require('../light-sensor.utilts');
const { getAmbientLightSensors, getLuxValue } = require("windows-ambient-sensor");

class WindowsAmbientLightSensor {
  constructor() {
    this.settings = null;
    this.monitors = null;
    this.sendToAllWindows = null;
    this.updateBrightnessThrottle = null;
    this.interval = null;
  }

  initialize(settings, monitors, sendToAllWindows, updateBrightnessThrottle) {
    this.settings = settings;
    this.monitors = monitors;
    this.sendToAllWindows = sendToAllWindows;
    this.updateBrightnessThrottle = updateBrightnessThrottle;
  }

  async reconnect() { }

  async changeSettings(settings) {
    // applyMonitorBRightnessFromLux(settings.sensors.fake.overriddenLux, this.monitors, settings.monitors, this.updateBrightnessThrottle);
    // this.sendToAllWindows('light-sensor', {
    //   type: 'fake',
    //   overriddenLux: settings.sensors.fake.overriddenLux
    // });
  }

  async connect() {
    this.interval = setInterval(() => {
      const sensors = getAmbientLightSensors();
      console.log(sensors);
      if (sensors.length === 0) {
        return;
      }
      const lux = getLuxValue();
      if (lux >= 0) {
        applyMonitorBRightnessFromLux(lux, this.monitors, settings.monitors, this.updateBrightnessThrottle);
      }
    }, 1_000);
  }

  async disconnect() {
    clearInterval(this.interval);
  }
}

module.exports = { WindowsAmbientLightSensor };

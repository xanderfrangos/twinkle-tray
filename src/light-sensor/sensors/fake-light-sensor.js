const { applyMonitorBrightnessFromLux } = require('../light-sensor.utilts');

class FakeLightSensor {
  constructor() {
    this.name = 'fake';
    this.settings = null;
    this.monitors = null;
    this.sendToAllWindows = null;
    this.updateBrightnessThrottle = null;
  }

  initialize(settings, monitors, sendToAllWindows, updateBrightnessThrottle) {
    this.settings = settings
    this.monitors = monitors
    this.sendToAllWindows = sendToAllWindows
    this.updateBrightnessThrottle = updateBrightnessThrottle
  }

  async reconnect() { }

  async changeSettings(settings) {
    this.settings = settings;
    if (!this.settings.enabled) {
      return;
    }

    applyMonitorBrightnessFromLux(settings.sensors.fake.overriddenLux, this.monitors, settings.monitorSettings, this.updateBrightnessThrottle);
  }

  async connect() { }

  async disconnect() { }
}

module.exports = { FakeLightSensor };

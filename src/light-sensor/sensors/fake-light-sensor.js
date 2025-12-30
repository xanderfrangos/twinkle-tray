const { applyMonitorBRightnessFromLux } = require('../light-sensor.utilts');

class FakeLightSensor {
  constructor() {
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
    applyMonitorBRightnessFromLux(settings.sensors.fake.overriddenLux, this.monitors, settings.monitors, this.updateBrightnessThrottle);
    // this.sendToAllWindows('light-sensor', {
    //   type: 'fake',
    //   overriddenLux: settings.sensors.fake.overriddenLux
    // });
  }

  async connect() { }

  async disconnect() { }
}

module.exports = { FakeLightSensor };

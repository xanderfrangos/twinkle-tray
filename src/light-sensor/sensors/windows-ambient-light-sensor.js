const { applyMonitorBrightnessFromLux } = require('../light-sensor.utilts');
const { getAmbientLightSensors, getLuxValue } = require("../../modules/windows-ambient-sensor");

class WindowsAmbientLightSensor {
  constructor() {
    this.name = 'windows';
    this.settings = null;
    this.monitors = null;
    this.sendToAllWindows = null;
    this.updateBrightnessThrottle = null;
    this.interval = null;
    this.sensorsAvailable = [];
    this.currentLux = null;
  }

  initialize(settings, monitors, sendToAllWindows, updateBrightnessThrottle) {
    this.settings = settings;
    this.monitors = monitors;
    this.sendToAllWindows = sendToAllWindows;
    this.updateBrightnessThrottle = updateBrightnessThrottle;
  }

  async reconnect() {
    await this.disconnect();
    await this.connect();
  }

  async changeSettings(settings) {
    this.settings = settings;
    this._pollSensors();
  }

  async connect() {
    console.log("Windows Ambient Light Sensor: Starting...");
    this._pollSensors();
    this.interval = setInterval(() => {
      this._pollSensors();
    }, 1000);
  }

  async disconnect() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.sensorsAvailable = [];
    this.currentLux = null;
    this._sendStatus();
    console.log("Windows Ambient Light Sensor: Stopped");
  }

  _sendStatus() {
    console.log('light-sensor--windows');
    if (this.sendToAllWindows) {
      this.sendToAllWindows('light-sensor--windows', {
        sensorsAvailable: this.sensorsAvailable,
        sensorCount: this.sensorsAvailable.length,
        currentLux: this.currentLux
      });
    }
  }

  _pollSensors() {
    try {
      const sensors = getAmbientLightSensors();
      this.sensorsAvailable = sensors;

      if (sensors.length === 0) {
        this.currentLux = null;
        this._sendStatus();
        return;
      }

      const lux = getLuxValue();
      if (lux >= 0) {
        this.currentLux = lux;
        console.log('Windows sensor - Current Lux:', lux);
        this._applyBrightness();
      } else {
        this.currentLux = null;
      }

      this._sendStatus();
    } catch (error) {
      console.error("Windows Ambient Light Sensor error:", error);
      this.sensorsAvailable = [];
      this.currentLux = null;
      this._sendStatus();
    }
  }

  _applyBrightness() {
    if (this.currentLux === null || !this.monitors || !this.updateBrightnessThrottle || !this.settings || !this.settings.enabled) {
      return;
    }

    applyMonitorBrightnessFromLux(
      this.currentLux,
      this.monitors,
      this.settings.monitorSettings,
      this.updateBrightnessThrottle
    );
  }
}

module.exports = { WindowsAmbientLightSensor };

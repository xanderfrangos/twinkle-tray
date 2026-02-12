require('yoctolib-es2017/yocto_api.js');
require('yoctolib-es2017/yocto_lightsensor.js');
const { applyMonitorBrightnessFromLux } = require('../light-sensor.utilts');

class YoctoLightSensor {
  constructor() {
    this.name = 'yocto';
    this.hubConnected = false;
    this.sensorConnected = false;
    this.sensor = null;
    this.currentLux = null;
    this.reconnectTimer = null;
    this.updateInterval = null;
    this.settings = null;
    this.monitors = null;
    this.sendToAllWindows = null;
    this.updateBrightnessThrottle = null;
  }

  initialize(settings, monitors, sendToAllWindows, updateBrightnessThrottle) {
    this.settings = settings;
    this.monitors = monitors;
    this.sendToAllWindows = sendToAllWindows;
    this.updateBrightnessThrottle = updateBrightnessThrottle;
  }

  async changeSettings(settings) {

    const connectionUrlChanged = this.settings.sensors.yocto.hubUrl !== settings.sensors.yocto.hubUrl;
    this.settings = settings;
    if (connectionUrlChanged) {
      this.reconnect();
    }
  }

  async reconnect() {
    await this.disconnect();
    await this.connect();
  }

  async connect() {
    try {
      await YAPI.LogUnhandledPromiseRejections();
      await YAPI.DisableExceptions();

      console.log(`Yoctohub url: ${this.settings.sensors.yocto.hubUrl}`);
      const res = await YAPI.RegisterHub(this.settings.sensors.yocto.hubUrl);
      if (res === YAPI.SUCCESS) {
        this.hubConnected = true;
        console.log("Yocto VirtualHub connected");

        // Setup device callbacks
        YAPI.RegisterDeviceArrivalCallback(() => {
          this.sensorConnected = true;
          this._sendStatus();
        });
        YAPI.RegisterDeviceRemovalCallback(() => {
          this.sensorConnected = false;
          this._sendStatus();
        });

        // Try to find sensor immediately
        this.sensor = YLightSensor.FirstLightSensor();
        if (this.sensor) {
          this.sensorConnected = true;
        }

        this._sendStatus();
        this._startPolling();
      } else {
        throw new Error("Hub connection failed");
      }
    } catch (err) {
      console.error("Yocto connection error:", err);
      this.hubConnected = false;
      this.sensorConnected = false;
      this._sendStatus();
      this._scheduleReconnect();
    }
  }

  async disconnect() {
    this._stopPolling();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    } 
    try {
      await YAPI.FreeAPI();
    } catch (e) {
      console.error("Error freeing YAPI", e);
    }
    this.hubConnected = false;
    this.sensorConnected = false;
    this.currentLux = null;
    this._sendStatus();
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(async () => {
      if (!this.settings?.enabled) return;
      console.log("Attempting Yocto reconnect...");
      try {
        await YAPI.FreeAPI();
      } catch (e) {
        console.error("Error freeing YAPI", e);
      }
      this.connect();
    }, 500);
  }

  _startPolling() {
    if (this.updateInterval) { 
      clearInterval(this.updateInterval);
    }
    this.updateInterval = setInterval(() => this._update(), 1000)
  }

  _stopPolling() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.updateInterval = null;
  }

  async _update() {
    if (!this.settings?.enabled || !this.hubConnected) return;

    try {
      const res = await YAPI.UpdateDeviceList();
      if (res !== YAPI.SUCCESS) {
        // Connection lost
        this.hubConnected = false;
        this._sendStatus();
        this._stopPolling();
        this._scheduleReconnect();
        return;
      }

      await YAPI.HandleEvents();
      this.hubConnected = true;

      let sensor = this.sensor || YLightSensor.FirstLightSensor();
      if (sensor && await sensor.isOnline()) {
        this.sensorConnected = true;
        this.currentLux = await sensor.get_currentRawValue();
        this._applyBrightness();
      } else {
        this.sensorConnected = false;
      }

      this._sendStatus();
    } catch (err) {
      console.error("Yocto polling error:", err);
      this.hubConnected = false;
      this._sendStatus();
      this._stopPolling();
      this._scheduleReconnect();
    }
  }

  _sendStatus() {
    if (this.sendToAllWindows) {
      this.sendToAllWindows('light-sensor--yocto', {
        hubConnected: this.hubConnected,
        sensorConnected: this.sensorConnected,
        lux: this.currentLux
      });
    }
  }

  _applyBrightness() {
    if (this.currentLux === null || !this.sensorConnected || !this.monitors || !this.updateBrightnessThrottle || !this.settings.enabled) {
      return;
    }

    applyMonitorBrightnessFromLux(this.currentLux, this.monitors, this.settings.monitorSettings, this.updateBrightnessThrottle);
  }

  _getStatus() {
    return {
      hubConnected: this.hubConnected,
      sensorConnected: this.sensorConnected,
      lux: this.currentLux
    };
  }
}

module.exports = { YoctoLightSensor };

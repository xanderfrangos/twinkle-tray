require('yoctolib-es2017/yocto_api.js');
require('yoctolib-es2017/yocto_lightsensor.js');

class YoctoLight {
  constructor() {
    this.hubConnected = false
    this.sensorConnected = false
    this.sensor = null
    this.currentLux = null
    this.reconnectTimer = null
    this.updateInterval = null
    this.settings = null
    this.monitors = null
    this.sendToAllWindows = null
    this.updateBrightnessThrottle = null
  }

  initialize(settings, monitors, sendToAllWindows, updateBrightnessThrottle) {
    this.settings = settings
    this.monitors = monitors
    this.sendToAllWindows = sendToAllWindows
    this.updateBrightnessThrottle = updateBrightnessThrottle
  }

  async reconnect() {
    await this.disconnect();
    await this.connect()
  }

  async connect() {
    if (!this.settings?.yoctoEnabled) return;
    
    try {
      await YAPI.LogUnhandledPromiseRejections();
      await YAPI.DisableExceptions();
      
      const url = this.settings.yoctoHubUrl || 'user:password@localhost';
      console.log(`Yoctohub url: ${url}`);
      const res = await YAPI.RegisterHub(url);
      if (res === YAPI.SUCCESS) {
        this.hubConnected = true
        console.log("Yocto VirtualHub connected")
        
        // Setup device callbacks
        YAPI.RegisterDeviceArrivalCallback(() => {
          this.sensorConnected = true
          this._sendStatus()
        })
        YAPI.RegisterDeviceRemovalCallback(() => {
          this.sensorConnected = false
          this._sendStatus()
        })
        
        // Try to find sensor immediately
        this.sensor = YLightSensor.FirstLightSensor()
        if (this.sensor) {
          this.sensorConnected = true
        }
        
        this._sendStatus()
        this._startPolling()
      } else {
        throw new Error("Hub connection failed")
      }
    } catch (err) {
      console.warn("Yocto connection error:", err)
      this.hubConnected = false
      this.sensorConnected = false
      this._sendStatus()
      this._scheduleReconnect()
    }
  }

  async disconnect() {
    this._stopPolling()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    try {
      await YAPI.FreeAPI()
    } catch(e) {
      console.log("Error freeing YAPI", e)
    }
    this.hubConnected = false
    this.sensorConnected = false
    this.currentLux = null
    this._sendStatus()
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    
    this.reconnectTimer = setTimeout(async () => {
      if (!this.settings?.yoctoEnabled) return;
      console.log("Attempting Yocto reconnect...")
      try {
        await YAPI.FreeAPI()
      } catch(e) {
        console.log("Error freeing YAPI", e)
      }
      this.connect()
    }, 5000)
  }

  _startPolling() {
    if (this.updateInterval) clearInterval(this.updateInterval)
    this.updateInterval = setInterval(() => this._update(), 1000)
  }

  _stopPolling() {
    if (this.updateInterval) clearInterval(this.updateInterval)
    this.updateInterval = null
  }

  async _update() {
    if (!this.settings?.yoctoEnabled || !this.hubConnected) return;
    
    try {
      const res = await YAPI.UpdateDeviceList()
      if (res !== YAPI.SUCCESS) {
        // Connection lost
        this.hubConnected = false
        this._sendStatus()
        this._stopPolling()
        this._scheduleReconnect()
        return
      }
      
      await YAPI.HandleEvents()
      this.hubConnected = true
      
      let sensor = this.sensor || YLightSensor.FirstLightSensor()
      if (sensor && await sensor.isOnline()) {
        this.sensorConnected = true
        this.currentLux = await sensor.get_currentRawValue()
        console.log('currentLux', this.currentLux);
        this._applyBrightness()
      } else {
        this.sensorConnected = false
      }
      
      this._sendStatus()
    } catch (err) {
      console.error("Yocto polling error:", err)
      this.hubConnected = false
      this._sendStatus()
      this._stopPolling()
      this._scheduleReconnect()
    }
  }

  _sendStatus() {
    if (this.sendToAllWindows) {
      this.sendToAllWindows('yocto-status', {
        hubConnected: this.hubConnected,
        sensorConnected: this.sensorConnected,
        illuminance: this.currentLux
      })
    }
  }

  _applyBrightness() {
    if (this.currentLux === null || !this.sensorConnected || !this.monitors || !this.updateBrightnessThrottle) return;
    
    for (const key in this.monitors) {
      const monitor = this.monitors[key]
      const monitorSettings = this.settings?.yoctoMonitorSettings?.[monitor.key]
      
      if (!monitorSettings?.enabled) continue
      
      const { minLux = 5, maxLux = 250 } = monitorSettings
      const brightness = Math.round(
        Math.max(0, Math.min(100, 
          ((this.currentLux - minLux) / (maxLux - minLux)) * 100
        ))
      )
      
      this.updateBrightnessThrottle(monitor.id, brightness, true, false)
    }
  }

  _getStatus() {
    return {
      hubConnected: this.hubConnected,
      sensorConnected: this.sensorConnected,
      illuminance: this.currentLux
    }
  }
}

module.exports = { YoctoLight };

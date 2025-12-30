const { YoctoLightSensor } = require('./sensors/yocto-light-sensor');
const { FakeLightSensor } = require('./sensors/fake-light-sensor');
const { WindowsAmbientLightSensor } = require('./sensors/windows-ambient-light-sensor');

class LightSensor {
    constructor() {
        this.sensors = {
            yocto: new YoctoLightSensor(),
            fake: new FakeLightSensor(),
            windows: new WindowsAmbientLightSensor(),
        };
        this.active = null;
    }

    /**
     * Handles changes to light sensor settings by comparing new and old configurations.
     *
     * @param {LightSensorSettings} newSettings - The updated settings object.
     * @param {LightSensorSettings} oldSettings - The previous settings object.
     *
     * @typedef {Object} LightSensorSettings
     * @property {boolean} enabled - Whether the light sensor system is enabled.
     * @property {'fake' | 'yocto'} active - The active sensor type (e.g., "yocto", "fake").
     * @property {Object} sensors - Configuration for available sensors.
     * @property {Object} sensors.yocto - Configuration for Yocto sensor.
     * @property {string} sensors.yocto.hubUrl - Connection URL for the Yocto hub.
     * @property {Object} sensors.fake - Configuration for the fake sensor.
     * @property {number} sensors.fake.overriddenLux - Lux value to override when using the fake sensor.
     * @property {Object<string, MonitorSettings>} monitorSettings - Map of monitor IDs to their settings.
     *
     * @typedef {Object} MonitorSettings
     * @property {number} minLux - Minimum lux threshold for the monitor.
     * @property {number} maxLux - Maximum lux threshold for the monitor.
     * @property {boolean} enabled - Whether monitoring is enabled for this monitor.
     *
     */
    async changeSettings(newSettings, oldSettings) {
        if (newSettings.active !== oldSettings.active) {
            sensors[oldSettings.active].disconnect();
            sensors[newSettings.active].connect();
            this.active = this.sensors[newSettings.active];
        }
        this.active.changeSettings(newSettings);
    }

    async start(settings, monitors, sendToAllWindows, updateBrightnessThrottle) {
        if (settings.enabled) {
            this.active = this.sensors[settings.active];
            this.active.initialize(settings, monitors, sendToAllWindows, updateBrightnessThrottle);
        }
    }
}

module.exports = { LightSensor };
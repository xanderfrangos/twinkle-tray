const { YoctoLightSensor } = require('./sensors/yocto-light-sensor');
const { FakeLightSensor } = require('./sensors/fake-light-sensor');
const { WindowsAmbientLightSensor } = require('./sensors/windows-ambient-light-sensor');

const defaultSettings = {
    enabled: false,
    active: "windows",
    sensors: {
        yocto: {
            hubUrl: "user:password@localhost"
        },
        fake: {
            overriddenLux: 50
        },
        windows: {}
    },
    monitorSettings: {}
};

/**
* @template T
* @param {T} data
* @returns {T}
*/
function clone(data) {
    return JSON.parse(JSON.stringify(data));
}

class LightSensor {
    constructor() {
        this.sensors = {
            yocto: new YoctoLightSensor(),
            fake: new FakeLightSensor(),
            windows: new WindowsAmbientLightSensor(),
        };
        this.active = null;
        this.enabled = null;
    }

    /**
     * Handles changes to light sensor settings by comparing new and old configurations.
     *
     * @param {LightSensorSettings} newSettings - The updated settings object.
     *
     * @typedef {Object} LightSensorSettings
     * @property {boolean} enabled - Whether the light sensor system is enabled.
     * @property {'fake' | 'yocto' | 'windows'} active - The active sensor type (e.g., "yocto", "fake", "windows").
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
    async changeSettings(newSettings) {
        // Handle undefined or empty settings
        if (!newSettings || !newSettings.active) {
            console.warn("Light sensor changeSettings called with invalid newSettings");
            return;
        }

        // Check if sensor type changed
        if (newSettings.active !== this.active?.name) {
            // Disconnect old sensor if it exists
            if (this.active) {
                try {
                    console.log(`Light Sensor: disconnecting ${this.active.name}`);
                    await this.active.disconnect();
                } catch (e) {
                    console.error(`Error disconnecting ${this.active.name} sensor:`, e);
                }
            }

            // Connect new sensor
            this.active = this.sensors[newSettings.active];
            if (this.active && newSettings.enabled) {
                try {
                    console.log(`Light Sensor: connecting ${this.active.name}`);
                    await this.active.connect();
                } catch (e) {
                    console.error(`Error connecting ${newSettings.active} sensor:`, e);
                }
            }
        }

        // If active sensor exists, update its settings
        if (this.active) {
            try {
                await this.active.changeSettings(newSettings);
            } catch (e) {
                console.error("Error updating sensor settings:", e);
            }
        }
    }

    /**
     * @param {{ enabled?: boolean; active: 'fake' | 'yocto' | 'windows'; sensors?: { yocto: { hubUrl: string; }; fake: { overriddenLux: number; }; windows: {}; }; monitorSettings?: {}; } | undefined} settings
     * @param {{}} monitors
     * @param {(eventName: any, data: any) => void} sendToAllWindows
     * @param {(id: any, level: any, useCap?: boolean, sendUpdate?: boolean, vcp?: string) => boolean} updateBrightnessThrottle
     * @param {(newSettings?: {}, processAfter?: boolean, sendUpdate?: boolean) => void} writeSettings
     */
    async start(settings, monitors, sendToAllWindows, updateBrightnessThrottle, writeSettings) {
        settings = this._healSettings(settings, writeSettings);
        for (const sensor of Object.values(this.sensors)) {
            sensor.initialize(settings, monitors, sendToAllWindows, updateBrightnessThrottle);
        }
        if (settings.active) {
            this.active = this.sensors[settings.active];
            if (this.active) {
                try {
                    console.log(`Light Sensor: connecting ${this.active.name}`);
                    await this.active.connect();
                } catch (e) {
                    console.error("Error starting light sensor:", e);
                }
            }
        }
    }

    /**
     * @param {{ enabled?: boolean; active?: 'fake' | 'yocto' | 'windows'; sensors?: { yocto: { hubUrl: string; }; fake: { overriddenLux: number; }; windows: {}; }; monitorSettings?: {}; } | undefined} settings
     * @param {(newSettings?: {}, processAfter?: boolean, sendUpdate?: boolean) => void} writeSettings
     */
    _healSettings(settings, writeSettings) {
        // 
        let healed = false;
        if (settings === undefined) {
            healed = true;
            // @ts-ignore
            settings = clone(defaultSettings);
        }
        if (settings.enabled === undefined) {
            healed = true;
            settings.enabled = clone(defaultSettings.enabled);
        }
        if (settings.active === undefined) {
            healed = true;
            // @ts-ignore
            settings.active = clone(defaultSettings.active);
        }
        if (settings.sensors === undefined) {
            healed = true;
            settings.sensors = clone(defaultSettings.sensors);
        }
        if (settings.sensors.yocto === undefined) {
            healed = true;
            settings.sensors.yocto = clone(defaultSettings.sensors.yocto);
        }
        if (typeof settings.sensors.yocto.hubUrl !== 'string') {
            healed = true;
            settings.sensors.yocto.hubUrl = clone(defaultSettings.sensors.yocto.hubUrl);
        }
        if (settings.sensors.fake === undefined) {
            healed = true;
            settings.sensors.fake = clone(defaultSettings.sensors.fake);
        }
        if (typeof settings.sensors.fake.overriddenLux !== 'number') {
            healed = true;
            settings.sensors.fake.overriddenLux = clone(defaultSettings.sensors.fake.overriddenLux);
        }
        if (settings.sensors.windows === undefined) {
            healed = true;
            settings.sensors.windows = clone(defaultSettings.sensors.windows);
        }
        if (settings.monitorSettings === undefined) {
            healed = true;
            settings.monitorSettings = clone(defaultSettings.monitorSettings);
        }

        if (healed) {
            console.log('Light Sensor: healing settings')
            writeSettings({
                lightSensor: settings
            });
        }
        return settings;
    }
}

module.exports = { LightSensor, defaultLightSensorSettings: clone(defaultSettings) };

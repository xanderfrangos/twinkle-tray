import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsChild, SettingsOption } from "../SettingsOption";
import { getMonitorName } from "../utilts/monitor.util";
import { YoctoSettings } from "./sensors/YoctoSettings";
import { FakeSensorSettings } from "./sensors/FakeSettings";
import { WindowsSettings } from "./sensors/WindowsSettings";

export function LightSensorSettings({ T, renderToggle, monitors }) {

  // trigger the monitor state update, as sometimes its not present
  useEffect(() => window.reloadReactMonitors(), []);

  const lightSensorSettings = window.settings.lightSensor ?? {
    enabled: true,
    active: "windows",
    sensors: {
        yocto: {
            hubUrl: "user:password@localhost"
        },
        fake: {
            overriddenLux: 2
        },
        windows: {}
    },
    "monitorSettings": {}
};

  const activeSensor = lightSensorSettings.active ?? 'windows';

  const renderLightSensorToggle = useCallback(() => {
    const isActive = lightSensorSettings.enabled || false;
    return (
      <div className="inputToggle-generic" data-textside="right">
        <input 
          onChange={(e) => { 
            window.sendSettings({ 
              lightSensor: { ...lightSensorSettings, enabled: e.target.checked } 
            }); 
          }} 
          checked={isActive} 
          data-checked={isActive} 
          type="checkbox" 
        />
        <div className="text">{(isActive ? T.t("GENERIC_ON") : T.t("GENERIC_OFF"))}</div>
      </div>
    );
  }, [lightSensorSettings, T]);

  const minMaxChange = useCallback((monitor, type, value) => {
    const currentSettings = lightSensorSettings.monitorSettings || {};
    const monitorSettings = currentSettings[monitor.key] || { minLux: 5, maxLux: 250, enabled: true };
    
    if (type === 'min') {
      monitorSettings.minLux = value;
    } else if (type === 'max') {
      monitorSettings.maxLux = value;
    }
    
    const newSettings = {
      ...currentSettings,
      [monitor.key]: monitorSettings
    };
    
    window.sendSettings({ lightSensor: { ...lightSensorSettings, monitorSettings: newSettings } });
  }, [lightSensorSettings]);

  const toggleMonitorEnabled = useCallback((monitor, enabled) => {
    const currentSettings = lightSensorSettings.monitorSettings || {};
    const monitorSettings = currentSettings[monitor.key] || { minLux: 5, maxLux: 250, enabled: true };
    
    monitorSettings.enabled = enabled;
    
    const newSettings = {
      ...currentSettings,
      [monitor.key]: monitorSettings
    };
    
    window.sendSettings({ lightSensor: { ...lightSensorSettings, monitorSettings: newSettings } });
  }, [lightSensorSettings]);


  const sensorTypeChanged = useCallback((e) => {
    const newActive = e.target.value;
    console.log({ lightSensor: { ...lightSensorSettings, active: newActive } });
    window.sendSettings({ lightSensor: { ...lightSensorSettings, active: newActive } });
  }, [lightSensorSettings]);

  const [sensorInterval, setSensorInterval] = useState(lightSensorSettings.sensorPollingInterval || 5);
  const sensorIntervalTimer = useRef(null);

  useEffect(() => {
    setSensorInterval(lightSensorSettings.sensorPollingInterval || 5);
  }, [lightSensorSettings.sensorPollingInterval]);

  const sensorIntervalChanged = useCallback((e) => {
    const newInterval = Number(e.target.value);
    setSensorInterval(newInterval);
    clearTimeout(sensorIntervalTimer.current);
    sensorIntervalTimer.current = setTimeout(() => {
      window.sendSettings({ lightSensor: { ...lightSensorSettings, sensorPollingInterval: newInterval } });
    }, 1000);
  }, [lightSensorSettings]);
  return (
    <>
      <div className="pageSection">
        <div className="sectionTitle">{T.t("SETTINGS_LIGHT_SENSOR_TITLE")}</div>
        <p>
          {T.t("SETTINGS_LIGHT_SENSOR_DESC")}
        </p>
        <br />
        <SettingsOption title={T.t("SETTINGS_LIGHT_SENSOR_ENABLE")} input={renderLightSensorToggle()}>
          <SettingsChild title={T.t("SETTINGS_LIGHT_SENSOR_TYPE_TITLE")} description={T.t("SETTINGS_LIGHT_SENSOR_TYPE_DESC")} input={
            <select value={activeSensor} onChange={sensorTypeChanged}>
                <option value="yocto">{T.t("SETTINGS_LIGHT_SENSOR_TYPE_YOCTO")}</option>
                <option value="fake">{T.t("SETTINGS_LIGHT_SENSOR_TYPE_FAKE")}</option>
                <option value="windows">{T.t("SETTINGS_LIGHT_SENSOR_TYPE_WINDOWS")}</option>
            </select>
          }></SettingsChild>
          <SettingsChild title={T.t("SETTINGS_LIGHT_SENSOR_POLLING_TITLE")} description={T.t("SETTINGS_LIGHT_SENSOR_POLLING_DESC")} input={
            <input 
              type="number"
              min="1"
              max="3600"
              value={sensorInterval}
              onChange={sensorIntervalChanged}
            />
          } />
        </SettingsOption>

        {activeSensor === 'yocto' && <YoctoSettings T={T} lightSensorSettings={lightSensorSettings} />}
        {activeSensor === 'fake' && <FakeSensorSettings T={T} lightSensorSettings={lightSensorSettings} />}
        {activeSensor === 'windows' && <WindowsSettings T={T} />}

        <SettingsOption title={T.t("SETTINGS_LIGHT_SENSOR_MONITORS_TITLE")} description={
          <>
            <div>{T.t("SETTINGS_LIGHT_SENSOR_MONITORS_DESC")}</div>
            <ul>
              <li>{T.t("SETTINGS_LIGHT_SENSOR_MONITORS_DESC_MIN")}</li>
              <li>{T.t("SETTINGS_LIGHT_SENSOR_MONITORS_DESC_MAX")}</li>
              <li>{T.t("SETTINGS_LIGHT_SENSOR_MONITORS_DESC_INTERPOLATE")}</li>
            </ul>
          </>
        } input={<></>}>
          {Object.values(monitors ?? {}).map((monitor) => {
            const monitorSettings = lightSensorSettings.monitorSettings?.[monitor.key] || { minLux: 5, maxLux: 250, enabled: false };
            return (
              <SettingsChild key={monitor.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    style={{ marginTop: '17px'}}
                    type="checkbox" 
                    checked={monitorSettings.enabled}
                    data-checked={monitorSettings.enabled}
                    onChange={(e) => toggleMonitorEnabled(monitor, e.target.checked)} 
                  />
                  <strong>{getMonitorName(monitor, {})}</strong>
                  <div style={{ margin: '0 0 0 auto'}}>
                      <label style={{ textTransform: "capitalize", fontSize: 'smaller' }}>{T.t("SETTINGS_LIGHT_SENSOR_MONITORS_MIN_LABEL")}</label>
                      <input 
                        style={{ marginTop: '5px '}}
                        type="number" 
                        min="0" 
                        max="600" 
                        value={monitorSettings.minLux} 
                        onChange={(e) => minMaxChange(monitor, 'min', Number(e.target.value))} 
                        />
                  </div>
                  <div>
                      <label style={{ textTransform: "capitalize", fontSize: 'smaller' }}>{T.t("SETTINGS_LIGHT_SENSOR_MONITORS_MAX_LABEL")}</label>
                      <input 
                        style={{ marginTop: '5px '}}
                        type="number" 
                        min="0" 
                        max="600" 
                        value={monitorSettings.maxLux} 
                        onChange={(e) => minMaxChange(monitor, 'max', Number(e.target.value))} 
                      />
                  </div>
                  <span>{T.t("GENERIC_LUX")}</span>
                </div>
              </SettingsChild>
            );
          })}
        </SettingsOption>
      </div>
    </>
  );
}

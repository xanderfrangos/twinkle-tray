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
        <div className="sectionTitle">Light Sensor</div>
        <p>
          Automatically update the brightness based on environment light from a light sensor.
        </p>
        <br />
        <SettingsOption title={'Enable feature'} input={renderLightSensorToggle()}>
          <SettingsChild title={"Sensor type"} description={"Choose the type of light sensor to use."} input={
            <select value={activeSensor} onChange={sensorTypeChanged}>
                <option value="yocto">Yocto</option>
                <option value="fake">Fake</option>
                <option value="windows">Windows Ambient</option>
            </select>
          }></SettingsChild>
          <SettingsChild title={"Sensor polling interval (seconds)"} description={"Set the interval at which the sensor polls for light data."} input={
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

        <SettingsOption title={"Monitor settings"} description={
          <>
            <div>This maps each monitor's brightness (0%-100%) to ambient light levels in Lux. For example, setting the range to 5 and 250 means:</div>
            <ul>
              <li>When the sensor reads 5 Lux or less, brightness is set to 0%.</li>
              <li>When the sensor reads 250 Lux or more, brightness is set to 100%.</li>
              <li>Values between 5 and 250 Lux are linearly interpolated.</li>
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
                      <label style={{ textTransform: "capitalize", fontSize: 'smaller' }}>0% at</label>
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
                      <label style={{ textTransform: "capitalize", fontSize: 'smaller' }}>100% at</label>
                      <input 
                        style={{ marginTop: '5px '}}
                        type="number" 
                        min="0" 
                        max="600" 
                        value={monitorSettings.maxLux} 
                        onChange={(e) => minMaxChange(monitor, 'max', Number(e.target.value))} 
                      />
                  </div>
                  <span>Lux</span>
                </div>
              </SettingsChild>
            );
          })}
        </SettingsOption>
      </div>
    </>
  );
}

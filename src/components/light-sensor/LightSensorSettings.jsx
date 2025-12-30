import { useCallback, useEffect, useMemo, useState } from "react";
import { SettingsChild, SettingsOption } from "../SettingsOption";
import { getMonitorName } from "../utilts/monitor.util";
import { YoctoSettings } from "./YoctoSettings";

export function LightSensorSettings({ T, renderToggle, monitors }) {

  // trigger the monitor state update, as sometimes its not present
  useEffect(() => window.reloadReactMonitors(),[])

  const minMaxChange = useCallback((monitor, type, value) => {
    const currentSettings = window.settings.yoctoMonitorSettings || {};
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
    
    window.sendSettings({ yoctoMonitorSettings: newSettings });
  }, []);

  const toggleMonitorEnabled = useCallback((monitor, enabled) => {
    const currentSettings = window.settings.yoctoMonitorSettings || {};
    const monitorSettings = currentSettings[monitor.key] || { minLux: 5, maxLux: 250, enabled: true };
    
    monitorSettings.enabled = enabled;
    
    const newSettings = {
      ...currentSettings,
      [monitor.key]: monitorSettings
    };
    
    window.sendSettings({ yoctoMonitorSettings: newSettings });
  }, []);


  const dropdownChanged = useCallback((newUrl) => {
    window.sendSettings({ yoctoHubUrl: newUrl });
  }, []);
  return (
    <>
      <div className="pageSection">
          <div className="sectionTitle">Light Sensor</div>
          <p>
            Set the brightness based on environment light from a light sensor
          </p>
      </div>
      <div className="pageSection">
        <SettingsChild title={'Enable'} input={renderToggle("yoctoEnabled")} />
        <SettingsOption title={"Select Sensor Type"} input={
          <select value={"yocto"} onChange={dropdownChanged}>
              <option value="yocto">Yocto</option>
              <option value="windows">Windows</option>
              <option value="fake">Fake</option>
          </select>
        }></SettingsOption>

        <YoctoSettings T={T} renderToggle={renderToggle} monitors={monitors}></YoctoSettings>
        <SettingsChild>
          <p>This maps each monitor's brightness (0%-100%) to ambient light levels in Lux.</p>
          <p>For example, setting the range to 5 and 250 means:</p>
          <ul>
            <li><p>When the sensor reads 5 Lux or less, brightness is set to 0%.</p></li>
            <li><p>When the sensor reads 250 Lux or more, brightness is set to 100%.</p></li>
            <li><p>Values between 5 and 250 Lux are linearly interpolated.</p></li>
          </ul>
        </SettingsChild>
        {Object.values(monitors ?? {}).map((monitor) => {
          const monitorSettings = window.settings.yoctoMonitorSettings?.[monitor.key] || { minLux: 5, maxLux: 250, enabled: false };
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
                <div>
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
      </div>
    </>
  );
}

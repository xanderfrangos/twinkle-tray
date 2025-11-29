import { useCallback, useEffect, useMemo, useState } from "react";
import { SettingsChild } from "./SettingsOption";
import { getMonitorName } from "./utilts/monitor.util";

export function YoctoSettings({ T, renderToggle, monitors }) {

  // trigger the monitor state update, as sometimes its not present
  useEffect(() => window.reloadReactMonitors(),[])
  
  const sensorUrl =
    "https://www.yoctopuce.com/EN/products/usb-environmental-sensors/yocto-light-v5";

  const [yoctoStatus, setYoctoStatus] = useState({
    hubConnected: false,
    sensorConnected: false,
    illuminance: null
  });

  useEffect(() => {
    const handleYoctoStatus = (e, status) => {
      setYoctoStatus(status);
    };
    
    window.ipc.on('yocto-status', handleYoctoStatus);
    
    return () => {
      window.ipc.removeListener('yocto-status', handleYoctoStatus);
    };
  }, []);

  const virtualhubUrl =
    "https://www.yoctopuce.com/EN/article/for-the-beginners/the-virtualhub-a-multi-purpose-tool";
  
  const message = useMemo(() => {
    if (!yoctoStatus.hubConnected) {
      return (
        <p>
          Yocto Virtual Hub not found see{" "}
          <a href={virtualhubUrl} target="_blank" rel="noreferrer">
            here
          </a>
        </p>
      );
    }
    if (!yoctoStatus.sensorConnected) {
      return <p>Yocto Light Sensor not found <span className="icon" style={{color: 'red'}}>&#xE783;</span></p>;
    }
    return <p>Yocto Light Sensor Found</p>;
  }, [yoctoStatus.hubConnected, yoctoStatus.sensorConnected]);

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

  const handleUrlChange = useCallback((newUrl) => {
    window.sendSettings({ yoctoHubUrl: newUrl });
  }, []);
  return (
    <>
      <div className="pageSection">
          <div className="sectionTitle">Yocto Light Sensor</div>
          <p>
            Set the brightness based on environment light from a{" "}
            <a href={sensorUrl}  target="_blank" rel="noreferrer">
              Yocto light sensor
            </a>
          </p>
      </div>
      <div className="pageSection">
        <SettingsChild title={'Enable'} input={renderToggle("yoctoEnabled")} />
        <SettingsChild>
          {message} {yoctoStatus.sensorConnected && yoctoStatus.illuminance !== null ? `${yoctoStatus.illuminance} Lux` : ''}
        </SettingsChild>
        <SettingsChild>
          <p>To communicate to the sensor, you need to install the "Yocto Virtual Hub" this allows this program to talk to connected sensors on your pc</p>
          <p><strong>Important:</strong> The virtual hub can be configured to auto start by running it on the command line with '-i'
            <br/>
            See
            <i>"-i : Installation as a service" {" "}
              <a href={'https://www.yoctopuce.com/EN/products/yocto-light-v5/doc/LIGHTMK5.usermanual.html'}  target="_blank" rel="noreferrer">
                Here
              </a>
            </i>
          </p>
            
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label>VirtualHub URL:</label>
            <input 
              type="text" 
              value={window.settings.yoctoHubUrl || 'http://127.0.0.1:4444'} 
              onChange={(e) => handleUrlChange(e.target.value)}
              style={{ flex: 1, maxWidth: '300px' }}
              placeholder="http://127.0.0.1:4444"
            />
            {
            yoctoStatus.hubConnected ? 
            <div className="icon">&#xE73E;</div> : 
            <><div className="icon" style={{color: 'red'}}>&#xE783;</div> <span>Disconnected</span></>
            }
          </div>
        </SettingsChild>
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

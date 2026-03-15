import { useCallback } from "react";
import { SettingsChild } from "../../SettingsOption";

export function FakeSensorSettings({ T, lightSensorSettings }) {

  const fakeSensorSettings = lightSensorSettings.sensors?.fake || { overriddenLux: 100 };

  const handleLuxChange = useCallback((newLux) => {
    const updatedSensors = {
      ...lightSensorSettings.sensors,
      fake: {
        ...fakeSensorSettings,
        overriddenLux: newLux
      }
    };
    window.sendSettings({ 
      lightSensor: { 
        ...lightSensorSettings, 
        sensors: updatedSensors 
      } 
    });
  }, [lightSensorSettings, fakeSensorSettings]);

  return (
    <>
      <SettingsChild>
        <p>
          A fake sensor for testing purposes. Set the simulated light level below.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ textTransform: "capitalize" }}>
            Simulated Light Level:
          </label>
          <input
            type="number"
            min="0"
            max="1000"
            value={fakeSensorSettings.overriddenLux}
            onChange={(e) => handleLuxChange(Number(e.target.value))}
            style={{ maxWidth: "100px" }}
          />
          <span>Lux</span>
        </div>
      </SettingsChild>
    </>
  );
}

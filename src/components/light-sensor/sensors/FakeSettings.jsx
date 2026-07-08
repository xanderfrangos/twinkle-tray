import { useCallback } from "react";
import { SettingsOption, SettingsChild } from "../../SettingsOption";

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
      <SettingsOption title={T.t("SETTINGS_LIGHT_SENSOR_FAKE_TITLE")} description={T.t("SETTINGS_LIGHT_SENSOR_FAKE_DESC")}>
        <SettingsChild title={T.t("SETTINGS_LIGHT_SENSOR_FAKE_LUX_TITLE")} description={T.t("SETTINGS_LIGHT_SENSOR_FAKE_LUX_DESC")}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label style={{ textTransform: "capitalize" }}>
              {T.t("SETTINGS_LIGHT_SENSOR_FAKE_LUX_LABEL")}
            </label>
            <input
              type="number"
              min="0"
              max="1000"
              value={fakeSensorSettings.overriddenLux}
              onChange={(e) => handleLuxChange(Number(e.target.value))}
              style={{ maxWidth: "100px" }}
            />
            <span>{T.t("GENERIC_LUX")}</span>
          </div>
        </SettingsChild>
      </SettingsOption>
    </>
  );
}

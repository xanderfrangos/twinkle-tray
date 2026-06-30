import { useEffect, useMemo, useState } from "react";
import { SettingsOption, SettingsChild } from "../../SettingsOption";

export function WindowsSettings({ T }) {
  const [windowsStatus, setWindowsStatus] = useState({
    sensorsAvailable: [],
    sensorCount: 0,
    currentLux: null,
  });

  useEffect(() => {
    const handleWindowsStatus = (e, status) => {
      setWindowsStatus(status);
    };

    window.ipc.on("light-sensor--windows", handleWindowsStatus);

    return () => {
      window.ipc.removeListener("light-sensor--windows", handleWindowsStatus);
    };
  }, []);

  const sensorMessage = useMemo(() => {
    if (windowsStatus.sensorCount === 0) {
      return (
        <p>
          {T.t("SETTINGS_LIGHT_SENSOR_WINDOWS_NOT_FOUND")}{" "}
          <span className="icon" style={{ color: "red" }}>
            &#xE783;
          </span>
        </p>
      );
    }
    return (
      <p>
        {T.t("SETTINGS_LIGHT_SENSOR_WINDOWS_FOUND")}{" "}
        <span className="icon" style={{ color: "green" }}>
          &#xE73E;
        </span>
      </p>
    );
  }, [windowsStatus.sensorCount, T]);

  const sensorList = useMemo(() => {
    if (
      windowsStatus.sensorsAvailable &&
      windowsStatus.sensorsAvailable.length > 0
    ) {
      return (
        <div>
          <p>
            <strong>{T.t("SETTINGS_LIGHT_SENSOR_WINDOWS_AVAILABLE")}</strong>
          </p>
          <ul>
            {windowsStatus.sensorsAvailable.map((sensor, idx) => (
              <li key={idx}>
                {sensor.name ?? sensor.deviceId ?? T.t("SETTINGS_LIGHT_SENSOR_WINDOWS_SENSOR_INDEX", idx + 1)}
              </li>
            ))}
          </ul>
        </div>
      );
    }
    return null;
  }, [windowsStatus.sensorsAvailable, T]);

  return (
    <>
      <SettingsOption title={T.t("SETTINGS_LIGHT_SENSOR_WINDOWS_TITLE")} description={T.t("SETTINGS_LIGHT_SENSOR_WINDOWS_DESC")}>
        <SettingsChild>
          <div>
            {sensorMessage}
            {windowsStatus.currentLux !== null && windowsStatus.sensorCount > 0 ? (
              <p>
                <strong>{T.t("SETTINGS_LIGHT_SENSOR_WINDOWS_CURRENT")}</strong> {windowsStatus.currentLux.toFixed(1)} {T.t("GENERIC_LUX")}
              </p>
            ) : null}
          </div>
        </SettingsChild>
        {sensorList && <SettingsChild>{sensorList}</SettingsChild>}
      </SettingsOption>
    </>
  );
}

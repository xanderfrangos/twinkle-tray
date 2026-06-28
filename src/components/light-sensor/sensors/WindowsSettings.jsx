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
          No Windows ambient light sensors found{" "}
          <span className="icon" style={{ color: "red" }}>
            &#xE783;
          </span>
        </p>
      );
    }
    return (
      <p>
        Windows Ambient Light Sensor Found{" "}
        <span className="icon" style={{ color: "green" }}>
          &#xE73E;
        </span>
      </p>
    );
  }, [windowsStatus.sensorCount]);

  const sensorList = useMemo(() => {
    if (
      windowsStatus.sensorsAvailable &&
      windowsStatus.sensorsAvailable.length > 0
    ) {
      return (
        <div>
          <p>
            <strong>Available Sensors:</strong>
          </p>
          <ul>
            {windowsStatus.sensorsAvailable.map((sensor, idx) => (
              <li key={idx}>
                {sensor.name ?? sensor.deviceId ?? `Sensor ${idx + 1}`}
              </li>
            ))}
          </ul>
        </div>
      );
    }
    return null;
  }, [windowsStatus.sensorsAvailable]);

  return (
    <>
      <SettingsOption title={"Windows Ambient Light Sensor"} description={"Uses the Windows built-in ambient light sensor to automatically adjust brightness."}>
        <SettingsChild>
          <div>
            {sensorMessage}
            {windowsStatus.currentLux !== null && windowsStatus.sensorCount > 0 ? (
              <p>
                <strong>Current Reading:</strong> {windowsStatus.currentLux.toFixed(1)} Lux
              </p>
            ) : null}
          </div>
        </SettingsChild>
        {sensorList && <SettingsChild>{sensorList}</SettingsChild>}
      </SettingsOption>
    </>
  );
}

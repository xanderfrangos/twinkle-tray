import { useCallback, useEffect, useMemo, useState } from "react";
import { SettingsOption, SettingsChild } from "../../SettingsOption";

export function YoctoSettings({ T, lightSensorSettings }) {

  const sensorUrl =
    "https://www.yoctopuce.com/EN/products/usb-environmental-sensors/yocto-light-v5";

  const yoctoSensorSettings = lightSensorSettings.sensors?.yocto ?? { hubUrl: "http://127.0.0.1:4444" };

  const [yoctoStatus, setYoctoStatus] = useState({
    hubConnected: false,
    sensorConnected: false,
    lux: null,
  });

  useEffect(() => {
    const handleYoctoStatus = (e, status) => {
      setYoctoStatus(status);
    };

    window.ipc.on("light-sensor--yocto", handleYoctoStatus);

    return () => {
      window.ipc.removeListener("light-sensor--yocto", handleYoctoStatus);
    };
  }, []);

  const virtualhubUrl =
    "https://www.yoctopuce.com/EN/article/for-the-beginners/the-virtualhub-a-multi-purpose-tool";

  const message = useMemo(() => {
    if (!yoctoStatus.hubConnected) {
      return (
        <p>
          {T.t("SETTINGS_LIGHT_SENSOR_YOCTO_HUB_NOT_FOUND")}:{" "}
          <a href={virtualhubUrl} target="_blank" rel="noreferrer">
            {virtualhubUrl}
          </a>
        </p>
      );
    }
    if (!yoctoStatus.sensorConnected) {
      return (
        <p>
          {T.t("SETTINGS_LIGHT_SENSOR_YOCTO_NOT_FOUND")}{" "}
          <span className="icon" style={{ color: "red" }}>
            &#xE783;
          </span>
        </p>
      );
    }
    return <p>{T.t("SETTINGS_LIGHT_SENSOR_YOCTO_FOUND")}</p>;
  }, [yoctoStatus.hubConnected, yoctoStatus.sensorConnected, T]);

  const handleUrlChange = useCallback((newUrl) => {
    const updatedSensors = {
      ...lightSensorSettings.sensors,
      yocto: {
        ...yoctoSensorSettings,
        hubUrl: newUrl
      }
    };
    window.sendSettings({ 
      lightSensor: { 
        ...lightSensorSettings, 
        sensors: updatedSensors 
      } 
    });
  }, [lightSensorSettings, yoctoSensorSettings]);
  return (
    <>
      <SettingsOption title={T.t("SETTINGS_LIGHT_SENSOR_YOCTO_TITLE")} description={T.t("SETTINGS_LIGHT_SENSOR_YOCTO_DESC")}>
        <SettingsChild>
          <>
            {message}{" "}
            {yoctoStatus.sensorConnected && yoctoStatus.lux !== null
              ? `${yoctoStatus.lux} ${T.t("GENERIC_LUX")}`
              : ""}
          </>
        </SettingsChild>
        <SettingsChild>
          <>
            <p>
              {T.t("SETTINGS_LIGHT_SENSOR_YOCTO_INSTALL_DESC")}
            </p>
            <p>
              <strong>{T.t("SETTINGS_LIGHT_SENSOR_YOCTO_IMPORTANT")}</strong> {T.t("SETTINGS_LIGHT_SENSOR_YOCTO_AUTOSTART")}
              <br />
              <i>
                {T.t("SETTINGS_LIGHT_SENSOR_YOCTO_SERVICE")}:{" "}
              </i>
              <a
                  href={
                    "https://www.yoctopuce.com/EN/products/yocto-light-v5/doc/LIGHTMK5.usermanual.html"
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  https://www.yoctopuce.com/EN/products/yocto-light-v5/doc/LIGHTMK5.usermanual.html
                </a>
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label>{T.t("SETTINGS_LIGHT_SENSOR_YOCTO_URL_LABEL")}</label>
              <input
                type="text"
                value={yoctoSensorSettings.hubUrl || "http://127.0.0.1:4444"}
                onChange={(e) => handleUrlChange(e.target.value)}
                style={{ flex: 1, maxWidth: "300px" }}
                placeholder="http://127.0.0.1:4444"
              />
              {yoctoStatus.hubConnected ? (
                <div className="icon">&#xE73E;</div>
              ) : (
                <>
                  <div className="icon" style={{ color: "red" }}>
                    &#xE783;
                  </div>{" "}
                  <span>{T.t("SETTINGS_LIGHT_SENSOR_YOCTO_DISCONNECTED")}</span>
                </>
              )}
            </div>
          </>
        </SettingsChild>
        
      </SettingsOption>
    </>
  );
}

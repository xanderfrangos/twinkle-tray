import { useCallback, useEffect, useMemo, useState } from "react";
import { SettingsChild } from "../SettingsOption";
import { getMonitorName } from "../utilts/monitor.util";

export function YoctoSettings({ T, renderToggle, monitors }) {
  // trigger the monitor state update, as sometimes its not present

  const sensorUrl =
    "https://www.yoctopuce.com/EN/products/usb-environmental-sensors/yocto-light-v5";

  const [yoctoStatus, setYoctoStatus] = useState({
    hubConnected: false,
    sensorConnected: false,
    illuminance: null,
  });

  useEffect(() => {
    const handleYoctoStatus = (e, status) => {
      setYoctoStatus(status);
    };

    window.ipc.on("yocto-status", handleYoctoStatus);

    return () => {
      window.ipc.removeListener("yocto-status", handleYoctoStatus);
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
      return (
        <p>
          Yocto Light Sensor not found{" "}
          <span className="icon" style={{ color: "red" }}>
            &#xE783;
          </span>
        </p>
      );
    }
    return <p>Yocto Light Sensor Found</p>;
  }, [yoctoStatus.hubConnected, yoctoStatus.sensorConnected]);

  const handleUrlChange = useCallback((newUrl) => {
    window.sendSettings({ yoctoHubUrl: newUrl });
  }, []);
  return (
    <>
      <SettingsChild>
        Get environment light from a{" "}
        <a href={sensorUrl} target="_blank" rel="noreferrer">
          Yocto light sensor
        </a>
        {message}{" "}
        {yoctoStatus.sensorConnected && yoctoStatus.illuminance !== null
          ? `${yoctoStatus.illuminance} Lux`
          : ""}
      </SettingsChild>
      <SettingsChild>
        <p>
          To communicate to the sensor, you need to install the "Yocto Virtual
          Hub" this allows this program to talk to connected sensors on your pc
        </p>
        <p>
          <strong>Important:</strong> The virtual hub can be configured to auto
          start by running it on the command line with '-i'
          <br />
          See
          <i>
            "-i : Installation as a service"{" "}
            <a
              href={
                "https://www.yoctopuce.com/EN/products/yocto-light-v5/doc/LIGHTMK5.usermanual.html"
              }
              target="_blank"
              rel="noreferrer"
            >
              Here
            </a>
          </i>
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label>VirtualHub URL:</label>
          <input
            type="text"
            value={window.settings.yoctoHubUrl || "http://127.0.0.1:4444"}
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
              <span>Disconnected</span>
            </>
          )}
        </div>
      </SettingsChild>
    </>
  );
}

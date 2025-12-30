function applyMonitorBRightnessFromLux(lux, monitors, monitorSettings, updateBrightnessThrottle) {
    for (const [key, monitor] in Object.entries(monitors)) {
        const monitorSetting = monitorSettings[key];

        if (!monitorSetting?.enabled) continue;

        const { minLux = 5, maxLux = 250 } = monitorSetting
        const brightness = Math.round(
            Math.max(0, Math.min(100,
                ((lux - minLux) / (maxLux - minLux)) * 100
            ))
        );

        updateBrightnessThrottle(monitor.id, brightness, true, false);
    }
}

module.exports = { applyMonitorBRightnessFromLux };
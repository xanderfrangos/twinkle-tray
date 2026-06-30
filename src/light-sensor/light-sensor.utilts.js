function applyMonitorBrightnessFromLux(lux, monitors, monitorSettings, updateBrightnessThrottle) {
    for (const [key, monitor] of Object.entries(monitors ?? {})) {
        const monitorSetting = monitorSettings[key];
        
        if (!monitorSetting?.enabled) {
            continue;
        }

        const { minLux = 5, maxLux = 250 } = monitorSetting
        const span = maxLux - minLux;
        if (span <= 0) {
            continue;
        }
        const brightness = Math.round(
            Math.max(0, Math.min(100,
                ((lux - minLux) / span) * 100
            ))
        );

        updateBrightnessThrottle(monitor.id, brightness, true, false);
    }
}

module.exports = { applyMonitorBrightnessFromLux };
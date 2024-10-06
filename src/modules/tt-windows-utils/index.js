"use strict";
const WindowUtils = require("bindings")("windows_window_utils");
const PowerEvents = require("bindings")("windows_power_events");
const MediaStatus = require("bindings")("windows_media_status");

module.exports = {
    WindowUtils: {
        setWindowPos: WindowUtils.setWindowPos,
        getWindowPos: WindowUtils.getWindowPos,
        getClientPos: WindowUtils.getClientPos,
        getClientPos: WindowUtils.getClientPos,
        setForegroundWindow: WindowUtils.setForegroundWindow,
        getForegroundWindow: WindowUtils.getForegroundWindow,
        getWindowLong: WindowUtils.getWindowLong,
        getWindowFullscreen: WindowUtils.getWindowFullscreen
    },
    PowerEvents: {
        registerPowerSettingNotifications: PowerEvents.registerPowerSettingNotifications,
        getPowerSetting: PowerEvents.getPowerSetting,
    },
    MediaStatus: {
        getPlaybackStatus: MediaStatus.getPlaybackStatus,
        getPlaybackInfo: MediaStatus.getPlaybackInfo
    }
}
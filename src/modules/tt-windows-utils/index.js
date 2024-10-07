"use strict";
const WindowUtils = require("bindings")("windows_window_utils");
const PowerEvents = require("bindings")("windows_power_events");
const MediaStatus = require("bindings")("windows_media_status");
const AppStartup = require("bindings")("windows_app_startup");
const WindowMaterial = require("bindings")("windows_window_material");

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
    },
    AppStartup: {
        enable: AppStartup.enable,
        disable: AppStartup.disable
    },
    WindowMaterial: {
        setWindowMaterial: (hwnd, materialType = 1, cornersType = 2, darkModeSupported = true) => {
            WindowMaterial.setWindowMaterial(hwnd, materialType, cornersType, (darkModeSupported ? 1 : 0))
        },
        setWindowAttribute: WindowMaterial.setWindowAttribute,
        setWindowCorners: (hwnd, cornerType = 0) => {
            WindowMaterial.setWindowAttribute(hwnd, 33, cornerType)
        },
        setDarkModeSupported: (hwnd, enabled = 1) => {
            WindowMaterial.setWindowAttribute(hwnd, 20, enabled)
        },
        setTransitionSupported: (hwnd, enabled = 1) => {
            WindowMaterial.setWindowAttribute(hwnd, 3, enabled)
        }
    }
}
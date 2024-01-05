const { ipcRenderer: ipc } = require('electron');

function getArgumentVars() {
    try {
        const jsVarsString = process.argv.find(arg => arg.indexOf("jsVars") === 0)
        const jsVars = JSON.parse(atob(jsVarsString.substring(6)))
        return jsVars
    } catch(e) {
        return {}
    }
}

function requestMonitors(fullRefresh = false) {
    if (fullRefresh) {
        ipc.send('full-refresh')
    } else {
        ipc.send('request-monitors')
    }
}

function requestAccent() {
    ipc.send('request-colors')
}

// Send brightness update request. Params are the monitor's index in the array and requested brightness level.
function updateBrightness(index, level) {
    ipc.send('update-brightness', {
        index,
        level
    })
}

//
// Send Settings
// - Send immediately if no recent changes. Throttle if frequent changes.
//
//

let sendSettingsThrottle = false
let sendSettingsObj = {}
function sendSettings(newSettings = {}) {
    sendSettingsObj = Object.assign(sendSettingsObj, newSettings)
    if (!sendSettingsThrottle) {
        actuallySendSettings()
        sendSettingsThrottle = setTimeout(() => {
            actuallySendSettings()
            sendSettingsThrottle = false
        }, 500)
    }
}

function sendSettingsImmediate(newSettings = {}) {
    ipc.send('send-settings', {
        newSettings,
        sendUpdate: false
    })
}

function actuallySendSettings() {
    ipc.send('send-settings', {
        newSettings: sendSettingsObj,
        sendUpdate: true
    })
    sendSettingsObj = {}
}

function requestSettings() {
    ipc.send('request-settings')
}

function resetSettings() {
    ipc.send('reset-settings')
}

function detectSunValley() {
    if(!window.reactReady) return false;
    try {
        // Detect new Fluent Icons (Windows build 21327+)
        if(window.settings.enableSunValley && document.fonts.check("12px Segoe Fluent Icons")) {
            window.document.body.dataset.fluentIcons = true
        } else {
            window.document.body.dataset.fluentIcons = false
        }
        // Detect new system font (Windows build 21376+)
        if(window.settings.enableSunValley && document.fonts.check("12px Segoe UI Variable Text")) {
            window.document.body.dataset.segoeUIVariable = true
        } else {
            window.document.body.dataset.segoeUIVariable = false
        }
        // Detect Windows 11
        window.document.body.dataset.isWin11 = (window.settings.isWin11 ? true : false)
    } catch(e) {
        console.log("Couldn't test for Sun Valley", e)
    }
}

function openURL(url) {
    ipc.send('open-url', url)
}

function getUpdate() {
    ipc.send('get-update', window.latestVersion)
    ipc.send('clear-update', window.latestVersion.version)
}

function checkForUpdates() {
    ipc.send('check-for-updates')
}

window.reloadReactMonitors = function() { 
    window.dispatchEvent(new CustomEvent('monitorsUpdated', {
        detail: window.allMonitors
    }))
}

// New app update recieved
ipc.on('latest-version', (event, version) => {
    window.latestVersion = version
    window.dispatchEvent(new CustomEvent('updateUpdated', {
        detail: version
    }))
})

// Update download progress
ipc.on('updateProgress', (event, progress) => {
    window.dispatchEvent(new CustomEvent('updateProgress', {
        detail: {
            progress
        }
    }))
})

// Monitor info updated
ipc.on("monitors-updated", (e, monitors) => {
    if (JSON.stringify(window.allMonitors) == JSON.stringify(monitors)) return false;
    window.allMonitors = monitors
    window.lastUpdate = Date.now()
    window.dispatchEvent(new CustomEvent('monitorsUpdated', {
        detail: monitors
    }))
})

// Accent colors recieved
ipc.on('update-colors', (event, data) => {
    window.document.body.style.setProperty("--system-accent-color", data.accent.hex)
    window.document.body.style.setProperty("--system-accent-lighter", data.lighter)
    window.document.body.style.setProperty("--system-accent-light", data.light)
    window.document.body.style.setProperty("--system-accent-medium", data.medium)
    window.document.body.style.setProperty("--system-accent-medium-dark", data.mediumDark)
    window.document.body.style.setProperty("--system-accent-transparent", data.transparent)
    window.document.body.style.setProperty("--system-accent-dark", data.dark)

    window.document.body.style.setProperty("--system-accent-dark1", data.accentDark1.hex)
    window.document.body.style.setProperty("--system-accent-dark2", data.accentDark2.hex)
    window.document.body.style.setProperty("--system-accent-dark3", data.accentDark3.hex)
    window.document.body.style.setProperty("--system-accent-light1", data.accentLight1.hex)
    window.document.body.style.setProperty("--system-accent-light2", data.accentLight2.hex)
    window.document.body.style.setProperty("--system-accent-light3", data.accentLight3.hex)
    window.accent = data.accent.hex
})

ipc.on('settings-updated', (event, settings) => {
    window.settings = settings
    detectSunValley()
    window.dispatchEvent(new CustomEvent('settingsUpdated', {
        detail: settings
    }))
})

ipc.on('window-history', (event, history) => {
    window.windowHistory = history
    window.dispatchEvent(new CustomEvent('windowHistory', {
        detail: history
    }))
})

// Localization recieved
ipc.on('localization-updated', (event, localization) => {
    window.dispatchEvent(new CustomEvent('localizationUpdated', {
        detail: localization
    }))
})

const processTheme = (event, theme) => {
    try {
        window.document.body.dataset["systemTheme"] = (theme.SystemUsesLightTheme == 0 ? "dark" : "light")
        window.document.body.dataset["transparent"] = (theme.EnableTransparency == 0 || theme.UseAcrylic == 0 ? "false" : "true")
        window.document.body.dataset["acrylic"] = (theme.UseAcrylic == 0 ? "false" : "true")

        // Disable acrylic on W10 because it's buggy
        if(!window.settings?.isWin11) {
            window.document.body.dataset["transparent"] = false
            window.document.body.dataset["acrylic"] = false
        }

        window.document.body.dataset["coloredTaskbar"] = (theme.ColorPrevalence == 0 ? "false" : "true")
    } catch (e) {
        window.document.body.dataset["systemTheme"] = "default"
        window.document.body.dataset["transparent"] = "false"
        window.document.body.dataset["acrylic"] = false
        window.document.body.dataset["coloredTaskbar"] = "false"
    }
}

// User personalization settings recieved
ipc.on('theme-settings', processTheme)

ipc.on('mica-wallpaper', (event, wallpaper) => {
    const mica = document.querySelector("#mica .displays")
    const micaIMG = document.querySelector("#mica img")
    if(!wallpaper) {
        mica.style.visibility = "hidden"
    } else {
        mica.style.visibility = "visible"
        micaIMG.src = wallpaper.path
        micaIMG.width = wallpaper.size?.width
        micaIMG.height = wallpaper.size?.height
    }
})

// Request startup data
window.addEventListener("DOMContentLoaded", () => {
    processTheme(undefined, getArgumentVars().lastTheme)
    requestSettings()
    requestMonitors()
    requestAccent()
})

// VCP code handling
window.addEventListener("setVCP", e => {
    const { monitor, code, value } = e.detail
    ipc.send("set-vcp", { monitor, code, value })
})

const SunCalc = require('suncalc')
function getSunCalcTimes(lat, long) {
    const localTimes = SunCalc.getTimes(new Date(), lat, long)
    for (const timeName in localTimes) {
        const time = localTimes[timeName].toLocaleTimeString()
        localTimes[timeName] = `${time.slice(0,4)}${time.slice(7)}`
    }
    return localTimes
}

window.ipc = ipc
window.updateBrightness = updateBrightness
window.requestMonitors = requestMonitors
window.sendSettings = sendSettings
window.sendSettingsImmediate = sendSettingsImmediate
window.requestSettings = requestSettings
window.resetSettings = resetSettings
window.getUpdate = getUpdate
window.checkForUpdates = checkForUpdates
window.openURL = openURL
window.allMonitors = []
window.lastUpdate = Date.now()
window.showPanel = false
window.reactReady = false
window.settings = getArgumentVars().settings
window.accent = "cyan"
window.getSunCalcTimes = getSunCalcTimes

window.version = 'v' + getArgumentVars().appVersion
window.versionTag = getArgumentVars().appVersionTag
window.versionBuild = getArgumentVars().appBuild
window.isAppX = (getArgumentVars().appName == "twinkle-tray-appx" ? true : false)
window.settingsPath = getArgumentVars().settingsPath
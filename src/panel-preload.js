const { ipcRenderer: ipc, remote } = require('electron');
let browser = remote.getCurrentWindow()

// Send logs to main thread
//console.log = (...e) => { e.forEach((c) => ipc.send('log', c)) }

const log = console.log

let isTransparent = false

// Show or hide the brightness panel
function setPanelVisibility(visible) {
    window.showPanel = visible

    // Update browser var to avoid Electron bugs
    browser = remote.getCurrentWindow()

    if (visible) {
        window.dispatchEvent(new CustomEvent('sleepUpdated', {
            detail: false
        }))
        if (!settings.useNativeAnimation) {
            setTimeout(() => {
                if (window.showPanel) {
                    ipc.send('show-acrylic')
                }
            }, 500)
        }
    } else {
        window.document.body.dataset["acrylicShow"] = false
        if (window.isAcrylic) {
            window.isAcrylic = false
        }
        setTimeout(() => { if(!window.showPanel && window.sleep) window.thisWindow.setBounds({width:0})}, 1000)
        window.dispatchEvent(new CustomEvent('sleepUpdated', {
            detail: true
        }))
    }


    // Update #root value
    if (window.isAcrylic) {
        window.isAcrylic = false
    }

    window.document.getElementById("root").dataset["visible"] = window.showPanel
    window.sleep = !visible

    // Blur all inputs to fix visual bugs
    if ("activeElement" in document)
        document.activeElement.blur();

    // Update interactivity
    if (window.showPanel) {
        browser.setIgnoreMouseEvents(false)
    } else {
        browser.setIgnoreMouseEvents(true)
    }
}

function requestMonitors() {
    ipc.send('request-monitors')
}

function requestAccent() {
    ipc.send('request-colors')
}

// Send brightness update request. Params are the monitor's index in the array and requested brightness level.
function updateBrightness(index, level) {
    if (!window.showPanel) return false;
    ipc.send('update-brightness', {
        index,
        level
    })
}

function detectSunValley() {
    // Detect new Fluent Icons (Windows build 21327+)
    if(window.settings.enableSunValley && document.fonts.check("12px Segoe Fluent Icons")) {
        window.document.getElementById("root").dataset.fluentIcons = true
    } else {
        window.document.getElementById("root").dataset.fluentIcons = false
    }
    // Detect new system font (Windows build 21376+)
    if(window.settings.enableSunValley && document.fonts.check("12px Segoe UI Variable Text")) {
        window.document.getElementById("root").dataset.segoeUIVariable = true
    } else {
        window.document.getElementById("root").dataset.segoeUIVariable = false
    }
}

function openSettings() {
    setPanelVisibility(false)
    thisWindow.blur()
    setTimeout(() => {
        ipc.send("open-settings")
    }, 111)
}

function sendSettings(newSettings) {
    ipc.send('send-settings', newSettings)
}

function requestSettings() {
    ipc.send('request-settings')
}

function sendHeight(height) {
    ipc.send('panel-height', height)
}

function pauseMonitorUpdates() {
    ipc.send('pause-updates')
}

function panelAnimationDone() {
    if (showPanel === false) {
        ipc.send('panel-hidden')
        window.sleep = true
        window.document.body.dataset["acrylicShow"] = false
        window.document.getElementById("root").dataset["sleep"] = true
        window.dispatchEvent(new CustomEvent('sleepUpdated', {
            detail: true
        }))
    } else {

    }
}

function shouldSendHeightUpdate() {
    setTimeout(() => {
        const height = window.document.getElementById("panel").offsetHeight
        window.sendHeight(height)
    }, 99)
}

function turnOffDisplays() {
    setPanelVisibility(false)
    thisWindow.blur()
    setTimeout(() => {
        ipc.send('sleep-displays')
    }, 111)
}

function installUpdate() {
    ipc.send('get-update', window.latestVersion)
    ipc.send('clear-update', window.latestVersion.version)
}

function dismissUpdate() {
    ipc.send('ignore-update', window.latestVersion.version)
}

// Tray icon clicked
ipc.on('tray-clicked', () => {
    window.document.getElementById("root").dataset["sleep"] = false
    setPanelVisibility(true)
})

ipc.on("panelBlur", (e) => {
    global.gc()
    // Update browser var to avoid Electron bugs
    browser = remote.getCurrentWindow()
    if (!browser.webContents.isDevToolsOpened()) {
        setPanelVisibility(false)
    } else {
        // Keep interactive if devTools open
        browser.moveTop()
    }
})

ipc.on("panel-unsleep", () => {
    window.dispatchEvent(new CustomEvent('sleepUpdated', {
        detail: false
    }))
})

// Monitor info updated
ipc.on("monitors-updated", (e, monitors) => {
    if (JSON.stringify(window.allMonitors) === JSON.stringify(monitors)) return false;
    window.allMonitors = monitors
    window.lastUpdate = Date.now()
    window.dispatchEvent(new CustomEvent('monitorsUpdated', {
        detail: monitors
    }))
})
ipc.on("force-refresh-monitors", (e) => {
    window.allMonitors = {}
    ipc.send('full-refresh', true)
})

// Accent colors recieved
ipc.on('update-colors', (event, data) => {
    window.document.body.style.setProperty("--system-accent-color", data.accent)
    window.document.body.style.setProperty("--system-accent-lighter", data.lighter)
    window.document.body.style.setProperty("--system-accent-light", data.light)
    window.document.body.style.setProperty("--system-accent-medium", data.medium)
    window.document.body.style.setProperty("--system-accent-medium-dark", data.mediumDark)
    window.document.body.style.setProperty("--system-accent-transparent", data.transparent)
    window.document.body.style.setProperty("--system-accent-dark", data.dark)
})

// Taskbar position recieved
ipc.on('taskbar', (event, taskbar) => {
    window.document.getElementById("root").dataset["position"] = taskbar.position
})

// Set display mode (overlay or normal)
ipc.on('display-mode', (event, mode) => {
    window.document.getElementById("root").dataset["mode"] = mode
    shouldSendHeightUpdate()
})

ipc.on('request-height', () => {
    ipc.send('panel-height', window.document.getElementById("panel").offsetHeight)
})

// Settings recieved
ipc.on('settings-updated', (event, settings) => {
    if (settings.isDev == false) {
        console.log = () => { }
    } else {
        console.log = log
        console.log = (...e) => { e.forEach((c) => ipc.send('log', c)) }
    }
    window.settings = settings
    detectSunValley()
    window.dispatchEvent(new CustomEvent('settingsUpdated', {
        detail: settings
    }))
})

// Localization recieved
ipc.on('localization-updated', (event, localization) => {
    window.dispatchEvent(new CustomEvent('localizationUpdated', {
        detail: localization
    }))
})

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

// User personalization settings recieved
ipc.on('theme-settings', (event, theme) => {
    try {
        window.theme = (theme.SystemUsesLightTheme == 0 ? "dark" : "light")
        window.document.body.dataset["systemTheme"] = (theme.SystemUsesLightTheme == 0 ? "dark" : "light")
        window.document.body.dataset["transparent"] = (theme.EnableTransparency == 0 ? "false" : "true")
        window.document.body.dataset["acrylic"] = (theme.UseAcrylic == 0 ? "false" : "true")
        window.document.body.dataset["coloredTaskbar"] = (theme.ColorPrevalence == 0 ? "false" : "true")
        window.document.body.dataset["useNativeAnimation"] = (settings.useNativeAnimation == false ? "false" : "true")
        isTransparent = theme.EnableTransparency
    } catch (e) {
        window.document.body.dataset["systemTheme"] = "default"
        window.document.body.dataset["transparent"] = "false"
        window.document.body.dataset["acrylic"] = "false"
        window.document.body.dataset["coloredTaskbar"] = "false"
        window.document.body.dataset["useNativeAnimation"] = "false"
    }
})

// Play non-acrylic animation
ipc.on('playPanelAnimation', () => {
    window.document.getElementById("root").dataset["visible"] = true
})

// Play non-acrylic animation
ipc.on('closePanelAnimation', () => {
    window.document.getElementById("root").dataset["visible"] = false
})

ipc.on('set-acrylic-show', () => {
    window.document.body.dataset["acrylicShow"] = true
})

// Request startup data
browser.webContents.once('dom-ready', () => {
    requestSettings()
    //requestMonitors()
    requestAccent()
})

window.ipc = ipc
window.thisWindow = browser
window.updateBrightness = updateBrightness
window.requestMonitors = requestMonitors
window.openSettings = openSettings
window.sendSettings = sendSettings
window.requestSettings = requestSettings
window.pauseMonitorUpdates = pauseMonitorUpdates
window.installUpdate = installUpdate
window.dismissUpdate = dismissUpdate
window.sendHeight = sendHeight
window.panelAnimationDone = panelAnimationDone
window.setPanelVisibility = setPanelVisibility
window.turnOffDisplays = turnOffDisplays
window.allMonitors = []
window.lastUpdate = Date.now()
window.showPanel = false
window.isAcrylic = false
window.theme = "dark"
window.settings = {}
window.isAppX = (remote.app.name == "twinkle-tray-appx" ? true : false)
const { ipcRenderer: ipc, remote } = require('electron');
const { exec } = require('child_process')
let browser = remote.getCurrentWindow()

// Show or hide the brightness panel
function setPanelVisibility(visible) {
    window.showPanel = visible

    // Update browser var to avoid Electron bugs
    browser = remote.getCurrentWindow()

    if(visible)
    window.dispatchEvent(new CustomEvent('sleepUpdated', {
        detail: false
    }))

    // Update #root value
    window.document.getElementById("root").dataset["visible"] = window.showPanel
    window.sleep = !visible

    // Blur all inputs to fix visual bugs
    if ("activeElement" in document)
        document.activeElement.blur();

    // Update interactivity
    if (window.showPanel) {
        browser.setIgnoreMouseEvents(false)
        browser.focus()
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
    if(!window.showPanel) return false;
    ipc.send('update-brightness', {
        index,
        level
    })
}

function openSettings() {
    setPanelVisibility(false)
    ipc.send("open-settings")
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

function panelAnimationDone() {
    if(showPanel === false) {
        ipc.send('panel-hidden')
        window.sleep = true
        window.document.getElementById("root").dataset["sleep"] = true
        window.dispatchEvent(new CustomEvent('sleepUpdated', {
            detail: true
        }))
    }
}

function turnOffDisplays() {
    setPanelVisibility(false)
    exec(`powershell.exe (Add-Type '[DllImport(\\"user32.dll\\")]^public static extern int SendMessage(int hWnd, int hMsg, int wParam, int lParam);' -Name a -Pas)::SendMessage(-1,0x0112,0xF170,2)`)
}

function installUpdate() {
    ipc.send('get-update', window.latestVersion.downloadURL)
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

// Monitor info updated
ipc.on("monitors-updated", (e, monitors) => {
    window.allMonitors = monitors
    window.lastUpdate = Date.now()
    window.dispatchEvent(new CustomEvent('monitorsUpdated', {
        detail: monitors
    }))
})

// Monitor names updated
// This takes longer, so we update it after the panel pops up
ipc.on("names-updated", (e, monitors) => {
    window.allMonitors = monitors
    window.lastUpdate = Date.now()
    window.dispatchEvent(new CustomEvent('namesUpdated', {
        detail: monitors
    }))
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

// Settings recieved
ipc.on('settings-updated', (event, settings) => {
    window.settings = settings
    window.dispatchEvent(new CustomEvent('settingsUpdated', {
        detail: settings
    }))
})

// New app update recieved
ipc.on('latest-version', (event, version) => {
    window.latestVersion = version
    window.dispatchEvent(new CustomEvent('updateUpdated', {
        detail: version
    }))
})

// User personalization settings recieved
ipc.on('theme-settings', (event, theme) => {
    try {
        window.document.body.dataset["systemTheme"] = (theme.SystemUsesLightTheme == 0 ? "dark" : "light")
        window.document.body.dataset["transparent"] = (theme.EnableTransparency == 0 ? "false" : "true")
        window.document.body.dataset["coloredTaskbar"] = (theme.ColorPrevalence == 0 ? "false" : "true")
    } catch (e) {
        window.document.body.dataset["systemTheme"] = "default"
        window.document.body.dataset["transparent"] = "false"
        window.document.body.dataset["coloredTaskbar"] = "false"
    }
})

// Request startup data
browser.webContents.once('dom-ready', () => {
    requestMonitors()
    requestAccent()
    requestSettings()
})

browser.on('blur', () => {
    if (!browser.webContents.isDevToolsOpened()) {
        setPanelVisibility(false)
    } else {
        // Keep interactive if devTools open
        browser.moveTop()
    }
})


window.updateBrightness = updateBrightness
window.requestMonitors = requestMonitors
window.openSettings = openSettings
window.sendSettings = sendSettings
window.requestSettings = requestSettings
window.installUpdate = installUpdate
window.dismissUpdate = dismissUpdate
window.sendHeight = sendHeight
window.panelAnimationDone = panelAnimationDone
window.setPanelVisibility = setPanelVisibility
window.turnOffDisplays = turnOffDisplays
window.allMonitors = []
window.lastUpdate = Date.now()
window.showPanel = false
window.settings = {}
window.isAppX = (remote.app.getName() == "twinkle-tray-appx" ? true : false)
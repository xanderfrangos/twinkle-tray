const { ipcRenderer: ipc, remote } = require('electron');
let browser = remote.getCurrentWindow()

function requestMonitors() {
    ipc.send('request-monitors')
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

function sendSettings(newSettings) {
    ipc.send('send-settings', newSettings)
}

function requestSettings() {
    ipc.send('request-settings')
}

// Monitor info updated
ipc.on("monitors-updated", (e, monitors) => {
    window.allMonitors = monitors
    window.lastUpdate = Date.now()
    window.dispatchEvent(new Event("monitorsUpdated"))
})

// Monitor names updated
// This takes longer, so we update it after the panel pops up
ipc.on("names-updated", (e, monitors) => {
    window.allMonitors = monitors
    window.lastUpdate = Date.now()
    window.dispatchEvent(new Event("namesUpdated"))
})

// Accent colors recieved
ipc.on('update-colors', (event, data) => {
    window.document.body.style.setProperty("--system-accent-color", data.accent)
})

ipc.on('settings-updated', (event, settings) => {
    window.settings = settings
    window.dispatchEvent(new CustomEvent('settingsUpdated', {
        detail: settings
    }))
})

// Request startup data
browser.webContents.once('dom-ready', () => {
    requestMonitors()
    requestAccent()
    requestSettings()
})

window.updateBrightness = updateBrightness
window.requestMonitors = requestMonitors
window.sendSettings = sendSettings
window.requestSettings = requestSettings
window.allMonitors = []
window.lastUpdate = Date.now()
window.showPanel = false
window.settings = {}
window.thisWindow = browser
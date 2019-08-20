const { ipcRenderer: ipc, remote } = require('electron');
let browser = remote.getCurrentWindow()

// Show or hide the brightness panel
function setPanelVisibility(visible) {
    window.showPanel = visible

    // Update browser var to avoid Electron bugs
    browser = remote.getCurrentWindow()

    // Update #root value
    window.document.getElementById("root").dataset["visible"] = window.showPanel

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
    ipc.send('update-brightness', {
        index,
        level
    })
}

function openSettings() {
    ipc.send("open-settings")
}

// Tray icon clicked
ipc.on('tray-clicked', () => {
    setPanelVisibility(true)
})

// Monitor info updated
ipc.on("monitors-updated", (e, monitors) => {
    window.allMonitors = monitors
    window.lastUpdate = Date.now()
    window.dispatchEvent(monitorsUpdated)
})

// Monitor names updated
// This takes longer, so we update it after the panel pops up
ipc.on("names-updated", (e, monitors) => {
    window.allMonitors = monitors
    window.lastUpdate = Date.now()
    window.dispatchEvent(namesUpdated)
})

// Accent colors recieved
ipc.on('update-colors', (event, data) => {
    window.document.body.style.setProperty("--system-accent-color", data.accent)
})

// Request startup data
browser.webContents.once('dom-ready', () => {
    requestMonitors()
    requestAccent()
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
window.allMonitors = []
window.lastUpdate = Date.now()
window.showPanel = false
window.settings = {}

const monitorsUpdated = new Event("monitorsUpdated")
const namesUpdated = new Event("namesUpdated")
const { ipcRenderer: ipc, remote } = require('electron');
let browser = remote.getCurrentWindow()

window.closeIntro = () => {
    ipc.send('close-intro')
}

// Request startup data
browser.webContents.once('dom-ready', () => {
    requestAccent()
})
browser.webContents.once('did-finish-load', () => {
    setTimeout(() => {
        document.getElementById("video").play()
    }, 2400)
})

// User personalization settings recieved
ipc.on('theme-settings', (event, theme) => {
    try {
        window.document.body.dataset["systemTheme"] = (theme.SystemUsesLightTheme == 0 ? "dark" : "light")
    } catch (e) {
        window.document.body.dataset["systemTheme"] = "default"
    }
})

function requestAccent() {
    ipc.send('request-colors')
}
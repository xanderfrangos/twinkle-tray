const { ipcRenderer: ipc, remote } = require('electron');
let browser = remote.getCurrentWindow()

window.closeIntro = () => {
    ipc.send('close-intro')
}

// Request startup data
browser.webContents.once('dom-ready', () => {
    requestAccent()
    ipc.send('request-language')
})
browser.webContents.once('did-finish-load', () => {
    setTimeout(() => {
        document.getElementById("video").play()
    }, 2400)
    ipc.send('request-language')
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

// Language recieved
ipc.on('language-updated', (event, language) => {
    window.dispatchEvent(new CustomEvent('languageUpdated', {
        detail: language
    }))
})
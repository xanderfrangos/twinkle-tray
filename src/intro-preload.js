const { ipcRenderer: ipc } = require('electron');

window.closeIntro = () => {
    ipc.send('close-intro')
}

function detectSunValley() {
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

// Request startup data
window.addEventListener('DOMContentLoaded', () => {
    requestAccent()
})
window.document.addEventListener('load', () => {
    ipc.send('request-localization')
    detectSunValley()
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

// Localization recieved
ipc.on('localization-updated', (event, localization) => {
    window.dispatchEvent(new CustomEvent('localizationUpdated', {
        detail: localization
    }))
})

window.ipc = ipc
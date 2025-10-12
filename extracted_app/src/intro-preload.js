const { ipcRenderer: ipc } = require('electron');

window.closeIntro = () => {
    ipc.send('close-intro')
}

function detectSunValley() {
    try {
        // Detect new Fluent Icons (Windows build 21327+)
        if(document.fonts.check("12px Segoe Fluent Icons")) {
            window.document.body.dataset.fluentIcons = true
            window.document.body.dataset.isWin11 = true
        } else {
            window.document.body.dataset.fluentIcons = false
        }
        // Detect new system font (Windows build 21376+)
        if(document.fonts.check("12px Segoe UI Variable Text")) {
            window.document.body.dataset.segoeUIVariable = true
        } else {
            window.document.body.dataset.segoeUIVariable = false
        }
    } catch(e) {
        console.log("Couldn't test for Sun Valley", e)
    }
}

window.addEventListener('load', () => {
    ipc.send('request-localization')
    detectSunValley()
    setTimeout(() => {
        document.getElementById("video").play()
    }, 2400)
})

// Localization recieved
ipc.on('localization-updated', (event, localization) => {
    window.dispatchEvent(new CustomEvent('localizationUpdated', {
        detail: localization
    }))
})

window.ipc = ipc
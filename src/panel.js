import React from "react";
import ReactDOM from "react-dom";
import BrightnessPanel from "./components/BrightnessPanel";

if (window.settings == undefined) window.settings = {}

window.ipc.send('request-localization')

ReactDOM.render(<BrightnessPanel monitors={window.allMonitors} lastUpdate={window.lastUpdate} />, document.getElementById("root"));


// Demo mode
window.addEventListener("enableDemoMode", () => {
    window.allMonitors = [{
        "brightness": 63,
        "device": "\\\\?\\DISPLAY#ACR0408#5&2e7612e0&0&UID4357#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}",
        "id": "\\\\.\\DISPLAY1",
        "localID": 0,
        "max": 100,
        "min": 0,
        "name": "XB270HU",
        "num": 0,
        "type": "ddcci"
    }, {
        "brightness": 46,
        "device": "\\\\?\\DISPLAY#DELA0BC#5&2e7612e0&0&UID4356#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}",
        "id": "\\\\.\\DISPLAY2",
        "localID": 1,
        "max": 100,
        "min": 0,
        "name": "DELL U2415",
        "num": 1,
        "type": "ddcci"
    }]
    window.dispatchEvent(new Event("monitorsUpdated"))
    window.document.getElementById("root").dataset["visible"] = true
    window.document.body.style.setProperty("--system-accent-color", window.accent || "#744DA9")
})

window.document.getElementById("root").addEventListener('transitionend', function () {
    window.panelAnimationDone()
});

window.document.addEventListener('keydown', (e) => {
    if (e.key === "Escape") {
        window.thisWindow.blur()
    }
})
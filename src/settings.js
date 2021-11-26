import React from "react";
import ReactDOM from "react-dom";
import SettingsWindow from "./Components/SettingsWindow";

window.ipc.send('request-localization')

const micaDisplays = document.querySelector("#mica .displays")

function updateMicaPosition(pos = [0, 0]) {
    micaDisplays.style.transform = `translate(${pos[0] * -1}px, ${pos[1] * -1}px)`
}

window.thisWindow.on("move", (e) => {
    updateMicaPosition(thisWindow.getPosition())
})

window.thisWindow.on("blur", () => {
    document.body.dataset.focused = "false"
})

window.thisWindow.on("focus", () => {
    document.body.dataset.focused = "true"
})

updateMicaPosition(thisWindow.getPosition())

ReactDOM.render(<SettingsWindow theme={window.settings.theme} />, document.getElementById("settings"));
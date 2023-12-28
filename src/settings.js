import React from "react";
import { createRoot } from 'react-dom/client';
import SettingsWindow from "./Components/SettingsWindow";

const micaDisplays = document.querySelector("#mica .displays")

function updateMicaPosition(pos = [0, 0]) {
    micaDisplays.style.transform = `translate(${pos[0] * -1}px, ${pos[1] * -1}px)`
}
window.ipc.on("settingsWindowMove", (e, position) => {
    updateMicaPosition(position)
})

window.addEventListener("blur", () => {
    document.body.dataset.focused = "false"
})

window.addEventListener("focus", () => {
    document.body.dataset.focused = "true"
})

createRoot(document.getElementById("settings")).render(<SettingsWindow theme={window.settings.theme} />)
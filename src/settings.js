import React from "react";
import ReactDOM from "react-dom";
import SettingsWindow from "./Components/SettingsWindow";

window.ipc.send('request-localization')

ReactDOM.render(<SettingsWindow theme={window.settings.theme} />, document.getElementById("settings"));

// Detect new Fluent Icons (Windows build 21327+)
if(document.fonts.check("12px Segoe Fluent Icons")) {
    window.document.body.dataset.fluentIcons = true
}

// Detect new system font (Windows build 21376+)
if(document.fonts.check("12px Segoe UI Variable Text")) {
    window.document.body.dataset.segoeUIVariable = true
}
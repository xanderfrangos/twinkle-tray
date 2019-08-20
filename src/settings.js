import React from "react";
import ReactDOM from "react-dom";
import SettingsWindow from "./Components/SettingsWindow";

ReactDOM.render(<SettingsWindow theme={window.settings.theme} />, document.getElementById("settings"));
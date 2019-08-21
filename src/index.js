import React from "react";
import ReactDOM from "react-dom";
import BrightnessPanel from "./components/BrightnessPanel";

ReactDOM.render(<BrightnessPanel monitors={window.allMonitors} lastUpdate={window.lastUpdate} />, document.getElementById("root"));
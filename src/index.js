import React from "react";
import ReactDOM from "react-dom";
import App from "./App";

ReactDOM.render(<App monitors={window.allMonitors} lastUpdate={window.lastUpdate} />, document.getElementById("root"));
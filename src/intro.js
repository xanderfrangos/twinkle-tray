import React from "react";
import ReactDOM from "react-dom";
import IntroWindow from "./components/IntroWindow";

window.ipc.send('request-localization')

ReactDOM.render(<IntroWindow />, document.getElementById("root"));
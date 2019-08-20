import React, { PureComponent, useState } from "react";
import Monitor from "./components/Monitor";
import Titlebar from "./components/Titlebar";

export default class App extends PureComponent {
  getMonitors = () => {
    if(this.state.monitors.length == 0) {
      return (<div className="no-displays-message">No displays found.</div>)
    } else {
      return this.state.monitors.map((monitor, index) => (
        <Monitor key={index} monitorNum={index} name={monitor.name} level={monitor.brightness} lastUpdate={this.props.lastUpdate} />
      ))
    }
  }

  constructor(props) {
    super(props);
    this.state = {
      monitors: []
    }
}

  componentDidMount() {
    window.addEventListener("monitorsUpdated", (e) => {
      this.setState({
        monitors: window.allMonitors
      })
    })
    window.addEventListener("namessUpdated", (e) => {
      this.setState({
        monitors: window.allMonitors
      })
    })
  }

  render() {
    return (
      <div className="window-base" data-theme={window.settings.theme || "default"}>
        <Titlebar />
        { this.getMonitors() }
      </div>
    );
  }
}

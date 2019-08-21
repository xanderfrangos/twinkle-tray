import React, { PureComponent, useState } from "react";
import Monitor from "./Monitor";

export default class BrightnessPanel extends PureComponent {
  getMonitors = () => {
    if(this.state.monitors.length == 0) {
      return (<div className="no-displays-message">No displays found.</div>)
    } else {
      return this.state.monitors.map((monitor, index) => (
        <Monitor key={index} monitorNum={index} name={monitor.name} level={monitor.brightness} lastUpdate={this.props.lastUpdate} />
      ))
    }
  }

  toggleLinkedLevels = () => {
    window.linkedLevelsActive = (window.linkedLevelsActive ? false : true)
    this.setState({
      linkedLevelsActive: window.linkedLevelsActive
    })
  }

  getLinkIcon = () => {
    if(window.allMonitors && window.allMonitors.length > 1) {
      return (
      <div title="Link levels" data-active={this.state.linkedLevelsActive} onClick={this.toggleLinkedLevels} className="link">&#xE71B;</div>
      )
    }
  }

  constructor(props) {
    super(props);
    this.state = {
      monitors: [],
      linkedLevelsActive: window.linkedLevelsActive
    }
}

  componentDidMount() {
    window.addEventListener("monitorsUpdated", (e) => {
      this.setState({
        monitors: window.allMonitors
      })
      this.forceUpdate()
    })
    window.addEventListener("namessUpdated", (e) => {
      this.setState({
        monitors: window.allMonitors
      })
      this.forceUpdate()
    })
    window.addEventListener("settingsUpdated", (e) => {
      this.forceUpdate()
    })
  }

  render() {
    return (
      <div className="window-base" data-theme={window.settings.theme || "default"}>
        <div className="titlebar">
        <div className="title">Adjust Brightness</div>
        <div className="icons">
          { this.getLinkIcon() }
          <div title="Settings" className="settings" onClick={window.openSettings}>&#xE713;</div>
        </div>
      </div>
        { this.getMonitors() }
      </div>
    );
  }
}

import React, { PureComponent } from "react";
import Slider from "./Slider";
import TranslateReact from "../TranslateReact"

const monitorSort = (a, b) => {
  const aSort = (a.order === undefined ? 999 : a.order * 1)
  const bSort = (b.order === undefined ? 999 : b.order * 1)
  return aSort - bSort
}

let T = new TranslateReact({}, {})

export default class BrightnessPanel extends PureComponent {

  // Render <Slider> components
  getMonitors = () => {
    if (!this.state.monitors || this.numMonitors == 0) {
      return (<div className="no-displays-message">{T.t("GENERIC_NO_COMPATIBLE_DISPLAYS")}</div>)
    } else {
      const sorted = Object.values(this.state.monitors).slice(0).sort(monitorSort)
      return sorted.map((monitor, index) => {
        if (monitor.type == "none") {
          return (<div key={monitor.key}></div>)
        } else {
          if(monitor.type == "wmi" || (monitor.type == "ddcci" && monitor.brightnessType)) {
            return (
              <Slider name={this.getMonitorName(monitor, this.state.names)} id={monitor.id} level={monitor.brightness} min={0} max={100} num={monitor.num} monitortype={monitor.type} hwid={monitor.key} key={monitor.key} onChange={this.handleChange} />
            )
          }
        }
      })
    }
  }

  // Render link icon, if available
  getLinkIcon = () => {
    if (this.numMonitors > 1) {
      return (
        <div title={T.t("PANEL_BUTTON_LINK_LEVELS")} data-active={this.state.linkedLevelsActive} onClick={this.toggleLinkedLevels} className="link">&#xE71B;</div>
      )
    }
  }

  getMonitorName = (monitor, renames) => {
    if (Object.keys(renames).indexOf(monitor.id) >= 0 && renames[monitor.id] != "") {
      return renames[monitor.id]
    } else {
      return monitor.name
    }
  }

  getUpdateBar = () => {
    if (this.state.update && this.state.update.show) {
      return (<div className="updateBar">
        <div className="left">{T.t("PANEL_UPDATE_AVAILABLE")} ({this.state.update.version})</div><div className="right"><a onClick={window.installUpdate}>{T.t("GENERIC_INSTALL")}</a><a className="icon" title={T.t("GENERIC_DISMISS")} onClick={window.dismissUpdate}>&#xEF2C;</a></div>
      </div>)
    } else if (this.state.update && this.state.update.downloading) {
      return (<div className="updateBar"><div className="left progress"><div className="progress-bar"><div style={{ width: `${this.state.updateProgress}%` }}></div></div></div><div className="right">{this.state.updateProgress}%</div></div>)
    }
  }


  // Enable/Disable linked levels
  toggleLinkedLevels = () => {
    const linkedLevelsActive = (this.state.linkedLevelsActive ? false : true)
    this.setState({
      linkedLevelsActive
    })
    window.sendSettings({
      linkedLevelsActive
    })
  }

  // Handle <Slider> changes
  handleChange = (level, slider) => {
    const monitors = Object.assign(this.state.monitors, {})
    const sliderMonitor = monitors[slider.props.hwid]

    if (this.numMonitors && this.state.linkedLevelsActive) {
      // Update all monitors (linked)
      for (let key in monitors) {
        const monitor = monitors[key]
        monitor.brightness = level
        if (slider.props.id != monitor.id) {
          //monitor.brightness = this.normalize(this.normalize(level, false, sliderMonitor.min, sliderMonitor.max), true, monitor.min, monitor.max)
        } else {

        }
      }
      this.setState({
        monitors
      }, () => {
        this.levelsChanged = true
        if (this.state.updateInterval === 999) this.syncBrightness()
      })
    } else if (this.numMonitors > 0) {
      // Update single monitor
      if (sliderMonitor) sliderMonitor.brightness = level;
      this.setState({
        monitors
      }, () => {
        this.levelsChanged = true
        if (this.state.updateInterval === 999) this.syncBrightness()
      })
    }

    this.forceUpdate()
  }






  // Update monitor info
  recievedMonitors = (e) => {
    let newMonitors = Object.assign(e.detail, {})
    this.lastLevels = []
    let numMonitors = 0
    for (let key in newMonitors) {
      if (newMonitors[key].type != "none" && !(newMonitors[key].type == "ddcci" && !newMonitors[key].brightnessType)) numMonitors++;
    }
    this.numMonitors = numMonitors
    // Reset panel height so it's recalculated
    this.panelHeight = -1
    this.setState({
      monitors: newMonitors
    })

    // Delay initial adjustments
    if (!this.init) setTimeout(() => { this.init = true }, 333)
  }


  updateMinMax = (inMonitors = false) => {
    if (this.numMonitors > 0) {

      let newMonitors = Object.assign((inMonitors ? inMonitors : this.state.monitors), {})

      for (let key in newMonitors) {
        for (let remap in this.state.remaps) {
          if (newMonitors[key].name == remap) {
            newMonitors[key].min = this.state.remaps[remap].min
            newMonitors[key].max = this.state.remaps[remap].max
          }
        }
      }

      this.levelsChanged = true

      if (inMonitors) {
        return inMonitors
      } else {
        this.setState({
          monitors: newMonitors
        }, () => {
          this.doBackgroundEvent = true
        })
      }

    }
  }

  // Update settings
  recievedSettings = (e) => {
    const settings = e.detail
    const linkedLevelsActive = (settings.linkedLevelsActive || false)
    const updateInterval = (settings.updateInterval || 500) * 1
    const remaps = (settings.remaps || {})
    const names = (settings.names || {})
    this.levelsChanged = true
    this.setState({
      linkedLevelsActive,
      remaps,
      names,
      updateInterval
    }, () => {
      this.resetBrightnessInterval()
      this.updateMinMax()
      this.forceUpdate()
      this.doBackgroundEvent = true
    })
  }

  recievedUpdate = (e) => {
    const update = e.detail
    this.setState({
      update
    })
  }

  recievedSleep = (e) => {
    this.setState({
      sleeping: e.detail
    })
  }



  normalize(level, sending = false, min = 0, max = 100) {
    if (min > 0 || max < 100) {
      let out = level
      if (sending) {
        out = (min + ((level / 100) * (max - min)))
      } else {
        out = ((level - min) * (100 / (max - min)))
      }
      return Math.round(out)
    } else {
      return level
    }
  }


  resetBrightnessInterval = () => {
    if (this.updateInterval) clearInterval(this.updateInterval)
    this.updateInterval = setInterval(this.syncBrightness, (this.state.updateInterval || 500))
  }



  // Send new brightness to monitors, if changed
  syncBrightness = () => {
    const monitors = this.state.monitors
    if (this.init && this.levelsChanged && (window.showPanel || this.doBackgroundEvent) && this.numMonitors) {
      this.doBackgroundEvent = false
      this.levelsChanged = false

      try {
        for (let idx in monitors) {
          if (monitors[idx].type != "none" && monitors[idx].brightness != this.lastLevels[idx]) {
            window.updateBrightness(monitors[idx].id, monitors[idx].brightness)
          }
        }
      } catch (e) {
        console.error("Could not update brightness")
      }
    }
  }


  constructor(props) {
    super(props);
    this.state = {
      monitors: [],
      linkedLevelsActive: false,
      names: {},
      update: false,
      sleeping: false,
      updateProgress: 0
    }
    this.lastLevels = []
    this.updateInterval = null
    this.doBackgroundEvent = false
    this.levelsChanged = false
    this.numMonitors = 0
    this.panelHeight = -1
    this.init = false
  }

  componentDidMount() {

    window.addEventListener("monitorsUpdated", this.recievedMonitors)
    window.addEventListener("settingsUpdated", this.recievedSettings)
    window.addEventListener("localizationUpdated", (e) => { T.setLocalizationData(e.detail.desired, e.detail.default) })
    window.addEventListener("updateUpdated", this.recievedUpdate)
    window.addEventListener("sleepUpdated", this.recievedSleep)

    if (window.isAppX === false) {
      window.addEventListener("updateProgress", (e) => {
        this.setState({
          updateProgress: e.detail.progress
        })
      })
    }

    // Update brightness every interval, if changed
    this.resetBrightnessInterval()

  }

  componentDidUpdate() {
    const height = window.document.getElementById("panel").offsetHeight
    if (this.panelHeight != height) {
      this.panelHeight = height
      window.sendHeight(height)
    }

  }

  render() {
    if (this.state.sleeping) {
      return (<div className="window-base" data-theme={window.settings.theme || "default"} id="panel"></div>)
    } else {
      return (
        <div className="window-base" data-theme={window.settings.theme || "default"} id="panel">
          <div className="titlebar">
            <div className="title">{T.t("PANEL_TITLE")}</div>
            <div className="icons">
              {this.getLinkIcon()}
              <div title={T.t("PANEL_BUTTON_TURN_OFF_DISPLAYS")} className="off" onClick={window.turnOffDisplays}>&#xF71D;</div>
              <div title={T.t("GENERIC_SETTINGS")} className="settings" onClick={window.openSettings}>&#xE713;</div>
            </div>
          </div>
          {this.getMonitors()}
          {this.getUpdateBar()}
        </div>
      );
    }

  }


}

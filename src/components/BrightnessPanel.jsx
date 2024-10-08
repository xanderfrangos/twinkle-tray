import React, { PureComponent } from "react";
import Slider from "./Slider";
import DDCCISliders from "./DDCCISliders"
import HDRSliders from "./HDRSliders";
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
      if (this.state.isRefreshing) {
        return (<div className="no-displays-message" style={{textAlign:"center", paddingBottom:"15px"}}>Detecting displays...</div>)
      }
      return (<div className="no-displays-message">{T.t("GENERIC_NO_COMPATIBLE_DISPLAYS")}</div>)
    } else {

      if(this.state.linkedLevelsActive) {
        // Combine all monitors
        let lastValidMonitor
        for(const key in this.state.monitors) {
          const monitor = this.state.monitors[key]
          if(monitor.type == "wmi" || monitor.type == "studio-display" || (monitor.type == "ddcci" && monitor.brightnessType)) {
           lastValidMonitor = monitor 
          }
        }
        if(lastValidMonitor) {
          const monitor = lastValidMonitor
          return (
            <Slider name={T.t("GENERIC_ALL_DISPLAYS")} id={monitor.id} level={monitor.brightness} min={0} max={100} num={monitor.num} monitortype={monitor.type} hwid={monitor.key} key={monitor.key} onChange={this.handleChange} scrollAmount={window.settings?.scrollFlyoutAmount} />
          )
        }
        return (<div className="no-displays-message">{T.t("GENERIC_NO_COMPATIBLE_DISPLAYS")}</div>)
      } else {
        // Show all valid monitors individually
        const sorted = Object.values(this.state.monitors).slice(0).sort(monitorSort)
        let useFeatures = false

        // Check if we should use the extended DDC/CI layout or simple layout
        for(const {hwid} of sorted) {
          const monitorFeatures = window.settings?.monitorFeatures?.[hwid[1]]
          for(const vcp in monitorFeatures) {

            if(vcp == "0x10" || vcp == "0x13" || vcp == "0xD6") {
              continue; // Skip if brightness or power state
            }

            const feature = monitorFeatures[vcp]
            if(feature) {
              // Feature is active
              // Now we check if there are any settings active for the feature
              const featureSettings = window.settings.monitorFeaturesSettings?.[hwid[1]]
              if( !(featureSettings?.[vcp]?.linked) ) {
                // Isn't linked
                useFeatures = true
              }
            }

          }
        }

        return sorted.map((monitor, index) => {
          if (monitor.type == "none" || window.settings?.hideDisplays?.[monitor.key] === true) {
            return (<div key={monitor.key}></div>)
          } else {
            if (monitor.type == "wmi" || monitor.type == "studio-display" || (monitor.type == "ddcci" && monitor.brightnessType)) {

              let hasFeatures = true
              let featureCount = 0
              const monitorFeatures = window.settings?.monitorFeatures?.[monitor.hwid[1]]
              const features = ["0x12", "0xD6", "0x62"]
              if (monitor.features) {
                features.forEach(f => {
                  // Check monitor features
                  if (monitor.features[f] && monitor.features[f].length > 1) {
                    // Check that user has enabled feature
                    if(monitorFeatures && monitorFeatures[f]) {
                      // Track feature
                      hasFeatures = true
                      featureCount++
                    }
                  }
                })
              }

              let showHDRSliders = false
              if(window.settings?.hdrDisplays?.[monitor.key]) {
                // Has HDR slider enabled
                hasFeatures = true
                useFeatures = true
                showHDRSliders = true
              }

              const powerOff = () => {
                window.ipc.send("sleep-display", monitor.hwid.join("#"))
                monitor.features["0xD6"][0] = (monitor.features["0xD6"][0] >= 4 ? 1 : settings.ddcPowerOffValue)
                this.forceUpdate()
              }
              const showPowerButton = () => {
                const customFeatureEnabled = window.settings?.monitorFeaturesSettings?.[monitor?.hwid[1]]?.["0xD6"]
                if(monitorFeatures?.["0xD6"] && (monitor.features?.["0xD6"] || customFeatureEnabled)) {
                  return (<div className="feature-power-icon simple" onClick={powerOff}><span className="icon vfix">&#xE7E8;</span><span>{(monitor.features?.["0xD6"][0] >= 4 ? T.t("PANEL_LABEL_TURN_ON") : T.t("PANEL_LABEL_TURN_OFF"))}</span></div>)
                }
              }

              if (!useFeatures || !hasFeatures) {
                return (
                  <div className="monitor-sliders" key={monitor.key}>
                    <Slider name={this.getMonitorName(monitor, this.state.names)} id={monitor.id} level={monitor.brightness} min={0} max={100} num={monitor.num} monitortype={monitor.type} hwid={monitor.key} key={monitor.key} onChange={this.handleChange} afterName={showPowerButton()} scrollAmount={window.settings?.scrollFlyoutAmount} />
                  </div>
                )
              } else {
                return (
                  <div className="monitor-sliders extended" key={monitor.key}>
                    <div className="monitor-item" style={{ height: "auto", paddingBottom: "18px" }}>
                      <div className="name-row">
                        <div className="icon">{(monitor.type == "wmi" ? <span>&#xE770;</span> : <span>&#xE7F4;</span>)}</div>
                        <div className="title">{this.getMonitorName(monitor, this.state.names)}</div>
                        { showPowerButton() }
                      </div>
                    </div>
                    <div className="feature-row feature-brightness">
                      <div className="feature-icon"><span className="icon vfix">&#xE706;</span></div>
                      <Slider id={monitor.id} level={monitor.brightness} min={0} max={100} num={monitor.num} monitortype={monitor.type} hwid={monitor.key} key={monitor.key} onChange={this.handleChange} scrollAmount={window.settings?.scrollFlyoutAmount} />
                    </div>
                    <DDCCISliders monitor={monitor} monitorFeatures={monitorFeatures} scrollAmount={window.settings?.scrollFlyoutAmount} />
                    { showHDRSliders ? <HDRSliders monitor={monitor} scrollAmount={window.settings?.scrollFlyoutAmount} /> : null }
                  </div>
                )
              }

            }
          }
        })
      }


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

  getSleepIcon = () => {
    if(window.settings.sleepAction !== "none") {
      return (
        <div title={T.t("PANEL_BUTTON_TURN_OFF_DISPLAYS")} className="off" onClick={window.turnOffDisplays}>&#xF71D;</div>
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

    window.pauseMonitorUpdates()

    this.forceUpdate()
  }






  // Update monitor info
  recievedMonitors = (e) => {
    let newMonitors = Object.assign(e.detail, {})
    this.lastLevels = []

    this.recalculateNumMonitors(newMonitors)
    
    // Reset panel height so it's recalculated
    this.panelHeight = -1
    this.setState({
      monitors: newMonitors
    })
    // Delay initial adjustments
    if (!this.init) setTimeout(() => { this.init = true }, 333)
  }

  recalculateNumMonitors = (newMonitors = this.state.monitors) => {
    let numMonitors = 0
    for (let key in newMonitors) {
      if (newMonitors[key].type != "none" && !(window.settings?.hideDisplays?.[key] === true)) numMonitors++;
    }
    this.numMonitors = numMonitors
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
    const linkedLevelsActive = (settings.linkedLevelsActive ?? false)
    const sleepAction = (settings.sleepAction ?? "none")
    const updateInterval = (settings.updateInterval || 500) * 1
    const remaps = (settings.remaps || {})
    const names = (settings.names || {})
    this.levelsChanged = true
    this.setState({
      linkedLevelsActive,
      remaps,
      names,
      updateInterval,
      sleepAction
    }, () => {
      this.recalculateNumMonitors()
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
      updateProgress: 0,
      isRefreshing: window.isRefreshing
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
    window.addEventListener("localizationUpdated", (e) => { T.setLocalizationData(e.detail.desired, e.detail.default); this.forceUpdate(); })
    window.addEventListener("updateUpdated", this.recievedUpdate)
    window.addEventListener("sleepUpdated", this.recievedSleep)
    window.addEventListener("isRefreshing", (e) => {
      this.setState({isRefreshing: e.detail})
    })

    if (window.isAppX === false) {
      window.addEventListener("updateProgress", (e) => {
        this.setState({
          updateProgress: e.detail.progress
        })
      })
    }

    // Update brightness every interval, if changed
    this.resetBrightnessInterval()

    window.requestSettings()
    window.requestMonitors()
    window.ipc.send('request-localization')
    window.reactReady = true
  }

  componentDidUpdate() {
    const height = window.document.getElementById("panel").offsetHeight
    if (this.panelHeight != height) {
      this.panelHeight = height
      window.sendHeight(height)
    }

  }

  render() {
    const monitorsElem = (this.state.sleeping ? (<div></div>) : this.getMonitors())
    return (
      <div className="window-base" data-theme={window.settings.theme || "default"} id="panel" data-refreshing={this.state.isRefreshing}>
        <div className="titlebar">
          <div className="title">{T.t("PANEL_TITLE")}</div>
          <div className="icons">
            {this.getLinkIcon()}
            {this.getSleepIcon()}
            <div title={T.t("GENERIC_SETTINGS")} className="settings" onClick={window.openSettings}>&#xE713;</div>
          </div>
        </div>
        { monitorsElem }
        {this.getUpdateBar()}
        {this.renderMica()}
      </div>
    )
  }

  renderMica() {
    return(
      <div id="mica">
        <div className="displays" style={{visibility: window.micaState.visibility}}>
          <div className="blur">
            <img alt="" src={window.micaState.src} width="2560" height="1440" />
          </div>
        </div>
        <div className="noise"></div>
      </div>
    )
  }

}
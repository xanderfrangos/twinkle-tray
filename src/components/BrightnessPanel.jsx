import React, { memo, useEffect, useMemo, useState } from "react";
import Slider from "./Slider";
import DDCCISliders from "./DDCCISliders"
import HDRSliders from "./HDRSliders";
import TranslateReact from "../TranslateReact"
import getMonitorName from "../utils/BrightnessPanel/getMonitorName";

const BrightnessPanel = memo(function BrightnessPanel() {

  const [state, setState] = useState({
    monitors: [],
    linkedLevelsActive: false,
    names: {},
    update: false,
    sleeping: false,
    updateProgress: 0,
    isRefreshing: window.isRefreshing
  })
  const [doBackgroundEvent, setDoBackgroundEvent] = useState(false)
  const [levelsChanged, setLevelsChanged] = useState(false)
  const [init, setInit] = useState(false)
  const [lastLevels, setLastLevels] = useState([])
  const [T] = useState(new TranslateReact({}, {}))

  const numMonitors = useMemo(() => {
    let localNumMonitors = 0
    for (let key in state.monitors) {
      if (state.monitors[key].type != "none" && !(window.settings?.hideDisplays?.[key] === true)) localNumMonitors++;
    }
    return localNumMonitors
  }, [state.monitors])

  let updateInterval = null
  let panelHeight = -1

  // Enable/Disable linked levels
  const toggleLinkedLevels = () => {
    const linkedLevelsActive = (state.linkedLevelsActive ? false : true)
    setState(prev => ({ ...prev, linkedLevelsActive }))
    window.sendSettings({
      linkedLevelsActive
    })
  }

  // Handle <Slider> changes
  const handleChange = (level, slider) => {
    const monitors = { ...state.monitors }
    const sliderMonitor = monitors[slider.props.hwid]
    if (numMonitors && state.linkedLevelsActive) {
      // Update all monitors (linked)
      for (let key in monitors) {
        const monitor = monitors[key]
        monitor.brightness = level
      }
      setState(prev => ({ ...prev, monitors }))
      setLevelsChanged(true)
      if (state.updateInterval === 999) syncBrightness()
    } else if (numMonitors > 0) {
      // Update single monitor
      if (sliderMonitor) sliderMonitor.brightness = level;
      setState(prev => ({ ...prev, monitors }))
      setLevelsChanged(true)
      if (state.updateInterval === 999) syncBrightness()
    }
    window.pauseMonitorUpdates()
  }

  // Update monitor info
  const recievedMonitors = (e) => {
    let newMonitors = { ...e.detail }
    setLastLevels([])
    // Reset panel height so it's recalculated
    panelHeight = -1
    setState(prev => ({
      ...prev,
      monitors: newMonitors
    }))
    // Delay initial adjustments
    if (!init) setTimeout(() => { setInit(true) }, 333)
  }

  const updateMinMax = (inMonitors = false) => {
    if (numMonitors > 0) {
      let newMonitors = Object.assign((inMonitors ? inMonitors : state.monitors), {})
      for (let key in newMonitors) {
        for (let remap in state.remaps) {
          if (newMonitors[key].name == remap) {
            newMonitors[key].min = state.remaps[remap].min
            newMonitors[key].max = state.remaps[remap].max
          }
        }
      }
      setLevelsChanged(true)
      if (inMonitors) {
        return inMonitors
      } else {
        setState(prev => ({
          ...prev,
          monitors: newMonitors
        }))
        setDoBackgroundEvent(true)
      }
    }
  }

  // Update settings
  const recievedSettings = (e) => {
    const settings = e.detail
    const linkedLevelsActive = (settings.linkedLevelsActive ?? false)
    const sleepAction = (settings.sleepAction ?? "none")
    const updateInterval = (settings.updateInterval || 500) * 1
    const remaps = (settings.remaps || {})
    const names = (settings.names || {})
    setLevelsChanged(true)
    setState(prev => ({
      ...prev,
      linkedLevelsActive,
      remaps,
      names,
      updateInterval,
      sleepAction
    }))
    resetBrightnessInterval()
    updateMinMax()
    setDoBackgroundEvent(true)
  }

  const recievedUpdate = (e) => {
    const update = e.detail
    setState(prev => ({ ...prev, update }))
  }

  const recievedSleep = (e) => {
    setState(prev => ({ ...prev, sleeping: e.detail }))
  }



  // Send new brightness to monitors, if changed
  const syncBrightness = () => {
    const monitors = state.monitors
    if (init && levelsChanged && (window.showPanel || doBackgroundEvent) && numMonitors) {
      setDoBackgroundEvent(false)
      setLevelsChanged(false)
      try {
        for (let idx in monitors) {
          if (monitors[idx].type != "none" && monitors[idx].brightness != lastLevels[idx]) {
            window.updateBrightness(monitors[idx].id, monitors[idx].brightness)
          }
        }
      } catch (e) {
        console.error("Could not update brightness")
      }
    }
  }

  const resetBrightnessInterval = () => {
    if (updateInterval) clearInterval(updateInterval)
    updateInterval = setInterval(() => syncBrightness(), (state.updateInterval || 500))
  }

  const handleIsRefreshingUpdate = (e) => setState(prev => ({ ...prev, isRefreshing: e.detail }))
  const handleUpdateProgress = (e) => setState(prev => ({ ...prev, updateProgress: e.detail.progress }))

  useEffect(() => {
    resetBrightnessInterval()
    return () => {
      clearInterval(updateInterval)
    }
  }, [state.monitors, numMonitors, doBackgroundEvent, levelsChanged, init])


  useEffect(() => {
    window.addEventListener("monitorsUpdated", (e) => recievedMonitors(e))
    window.addEventListener("settingsUpdated", (e) => recievedSettings(e))
    window.addEventListener("localizationUpdated", (e) => T.setLocalizationData(e.detail.desired, e.detail.default))
    window.addEventListener("updateUpdated", (e) => recievedUpdate(e))
    window.addEventListener("sleepUpdated", (e) => recievedSleep(e))
    window.addEventListener("isRefreshing", (e) => handleIsRefreshingUpdate(e))

    if (window.isAppX === false) {
      window.addEventListener("updateProgress", (e) => handleUpdateProgress(e))
    }

    // Update brightness every interval, if changed
    window.requestSettings()
    window.requestMonitors()
    window.ipc.send('request-localization')
    window.reactReady = true

    return () => {
      window.removeEventListener("monitorsUpdated")
      window.removeEventListener("settingsUpdated")
      window.removeEventListener("localizationUpdated")
      window.removeEventListener("updateUpdated")
      window.removeEventListener("sleepUpdated")
      window.removeEventListener("isRefreshing")
      window.removeEventListener("updateProgress")
    }
  }, [])

  useEffect(() => {
    const height = window.document.getElementById("panel").offsetHeight
    if (panelHeight != height) {
      panelHeight = height
      window.sendHeight(height)
    }
  })

  const getMonitors = () => {
    if (!state.monitors || numMonitors == 0) {
      if (state.isRefreshing) {
        return (<div className="no-displays-message" style={{ textAlign: "center", paddingBottom: "15px" }}>{T.t("GENERIC_DETECTING_DISPLAYS")}</div>)
      }
      return (<div className="no-displays-message">{T.t("GENERIC_NO_COMPATIBLE_DISPLAYS")}</div>)
    } else {
      if (state.linkedLevelsActive) {
        // Combine all monitors
        let lastValidMonitor
        for(const key in state.monitors) {
          const monitor = state.monitors[key]
          if(monitor.type == "wmi" || monitor.type == "studio-display" || (monitor.type == "ddcci" && monitor.brightnessType) || (monitor.hdr === "active" || monitor.hdr === "supported")) {
           lastValidMonitor = monitor 
          }
        }
        if (lastValidMonitor) {
          const monitor = lastValidMonitor
          return (
            <Slider name={T.t("GENERIC_ALL_DISPLAYS")} id={monitor.id} level={monitor.brightness} min={0} max={100} num={monitor.num} monitortype={monitor.type} hwid={monitor.key} key={monitor.key} onChange={handleChange} scrollAmount={window.settings?.scrollFlyoutAmount} />
          )
        }
        return (<div className="no-displays-message">{T.t("GENERIC_NO_COMPATIBLE_DISPLAYS")}</div>)
      } else {
        // Show all valid monitors individually
        const sorted = Object.values(state.monitors).slice(0).sort((a, b) => {
          const aSort = (a.order === undefined ? 999 : a.order * 1)
          const bSort = (b.order === undefined ? 999 : b.order * 1)
          return aSort - bSort
        })
        let useFeatures = false
        // Check if we should use the extended DDC/CI layout or simple layout
        for (const { hwid } of sorted) {
          const monitorFeatures = window.settings?.monitorFeatures?.[hwid[1]]
          for (const vcp in monitorFeatures) {
            if (vcp == "0x10" || vcp == "0x13" || vcp == "0xD6") {
              continue; // Skip if brightness or power state
            }
            const feature = monitorFeatures[vcp]
            if (feature) {
              // Feature is active
              // Now we check if there are any settings active for the feature
              const featureSettings = window.settings.monitorFeaturesSettings?.[hwid[1]]
              if (!(featureSettings?.[vcp]?.linked)) {
                // Isn't linked
                useFeatures = true
              }
            }
          }
        }

        return sorted.map((monitor) => {
          if ((monitor.type == "none" && !(monitor.hdr === "active" || monitor.hdr === "supported")) || window.settings?.hideDisplays?.[monitor.key] === true) {
            return (<div key={monitor.key}></div>)
          } else {
            if (monitor.type == "wmi" || monitor.type == "studio-display" || (monitor.type == "ddcci" && monitor.brightnessType) || (monitor.hdr === "active" || monitor.hdr === "supported")) {

              let hasFeatures = true
              let featureCount = 0
              const monitorFeatures = window.settings?.monitorFeatures?.[monitor.hwid[1]]
              const features = ["0x12", "0xD6", "0x62"]
              if (monitor.features) {
                features.forEach(f => {
                  // Check monitor features
                  if (monitor.features[f] && monitor.features[f].length > 1) {
                    // Check that user has enabled feature
                    if (monitorFeatures && monitorFeatures[f]) {
                      // Track feature
                      hasFeatures = true
                      featureCount++
                    }
                  }
                })
              }
              let showHDRSliders = false
              if((monitor.hdr === "active" || monitor.hdr === "supported" || window.settings?.hdrDisplays?.[monitor.key]) && !(window.settings?.sdrAsMainSliderDisplays?.[monitor.key])) {
                // Has HDR slider enabled
                hasFeatures = true
                useFeatures = true
                showHDRSliders = true
              }
              const powerOff = () => {
                window.ipc.send("sleep-display", monitor.hwid.join("#"))
                monitor.features["0xD6"][0] = (monitor.features["0xD6"][0] >= 4 ? 1 : settings.ddcPowerOffValue)
              }
              const showPowerButton = () => {
                const customFeatureEnabled = window.settings?.monitorFeaturesSettings?.[monitor?.hwid[1]]?.["0xD6"]
                if (monitorFeatures?.["0xD6"] && (monitor.features?.["0xD6"] || customFeatureEnabled)) {
                  return (<div className="feature-power-icon simple" onClick={powerOff}><span className="icon vfix">&#xE7E8;</span><span>{(monitor.features?.["0xD6"][0] >= 4 ? T.t("PANEL_LABEL_TURN_ON") : T.t("PANEL_LABEL_TURN_OFF"))}</span></div>)
                }
              }

              // Check if it's an HDR display and only supports SDR brightness adjustment.
              const isHDROnlySDR = (monitor.hdr === "active" || monitor.hdr === "supported") && monitor.type === "none";
              
              if (!useFeatures || !hasFeatures) {
                // For HDR displays that only support SDR, the HDR slider is displayed directly instead of the regular brightness slider.
                if (isHDROnlySDR && showHDRSliders) {
                  return (
                    <div className="monitor-sliders extended" key={monitor.key}>
                      <div className="monitor-item" style={{ height: "auto", paddingBottom: "18px" }}>
                        <div className="name-row">
                          <div className="icon"><span>&#xE7F4;</span></div>
                          <div className="title">{getMonitorName(monitor, state.names)}</div>
                          { showPowerButton() }
                        </div>
                      </div>
                      <HDRSliders monitor={monitor} scrollAmount={window.settings?.scrollFlyoutAmount} />
                    </div>
                  )
                }
                return (
                  <div className="monitor-sliders" key={monitor.key}>
                    <Slider name={getMonitorName(monitor, state.names)} id={monitor.id} level={monitor.brightness} min={0} max={100} num={monitor.num} monitortype={monitor.type} hwid={monitor.key} key={monitor.key} onChange={handleChange} afterName={showPowerButton()} scrollAmount={window.settings?.scrollFlyoutAmount} />
                  </div>
                )
              } else {
                return (
                  <div className="monitor-sliders extended" key={monitor.key}>
                    <div className="monitor-item" style={{ height: "auto", paddingBottom: "18px" }}>
                      <div className="name-row">
                        <div className="icon">{(monitor.type == "wmi" ? <span>&#xE770;</span> : <span>&#xE7F4;</span>)}</div>
                        <div className="title">{getMonitorName(monitor, state.names)}</div>
                        {showPowerButton()}
                      </div>
                    </div>
                    {/* For HDR displays that only support SDR, hide the regular brightness slider. */}
                    { !isHDROnlySDR && (
                      <div className="feature-row feature-brightness">
                        <div className="feature-icon"><span className="icon vfix">&#xE706;</span></div>
                        <Slider id={monitor.id} level={monitor.brightness} min={0} max={100} num={monitor.num} monitortype={monitor.type} hwid={monitor.key} key={monitor.key} onChange={handleChange} scrollAmount={window.settings?.scrollFlyoutAmount} />
                      </div>
                    )}
                    <DDCCISliders monitor={monitor} monitorFeatures={monitorFeatures} scrollAmount={window.settings?.scrollFlyoutAmount} />
                    {showHDRSliders ? <HDRSliders monitor={monitor} scrollAmount={window.settings?.scrollFlyoutAmount} /> : null}
                  </div>
                )
              }
            }
          }
        })
      }
    }
  }

  return (
    <div className="window-base" data-theme={window.settings.theme || "default"} id="panel" data-refreshing={state.isRefreshing}>
      <div className="titlebar">
        <div className="title">{T.t("PANEL_TITLE")}</div>
        <div className="icons">
          {
            numMonitors > 1 &&
            <div
              title={T.t("PANEL_BUTTON_LINK_LEVELS")}
              data-active={state.linkedLevelsActive}
              onClick={toggleLinkedLevels}
              className="link">
              &#xE71B;
            </div>
          }
          {
            window.settings.sleepAction !== "none" &&
            <div
              title={T.t("PANEL_BUTTON_TURN_OFF_DISPLAYS")}
              className="off"
              onClick={window.turnOffDisplays}>
              &#xF71D;
            </div>
          }
          <div title={T.t("GENERIC_SETTINGS")} className="settings" onClick={window.openSettings}>&#xE713;</div>
        </div>
      </div>
      {state.sleeping ? (<div></div>) : getMonitors()}
      {
        (state.update && state.update.show)
          ?
          <div className="updateBar">
            <div className="left">
              {T.t("PANEL_UPDATE_AVAILABLE")}
              ({state.update.version})
            </div>
            <div className="right">
              <a onClick={window.installUpdate}>
                {T.t("GENERIC_INSTALL")}
              </a>
              <a className="icon" title={T.t("GENERIC_DISMISS")} onClick={window.dismissUpdate}>
                &#xEF2C;
              </a>
            </div>
          </div>
          :
          (state.update && state.update.downloading)
          &&
          <div className="updateBar">
            <div className="left progress">
              <div className="progress-bar">
                <div style={{ width: `${state.updateProgress}%` }}>
                </div>
              </div>
            </div>
            <div className="right">
              {state.updateProgress}%
            </div>
          </div>
      }
      <div id="mica">
        <div className="displays" style={{ visibility: window.micaState.visibility }}>
          <div className="blur">
            <img alt="" src={window.micaState.src} width="2560" height="1440" />
          </div>
        </div>
        <div className="noise"></div>
      </div>
    </div>
  )
})

export default BrightnessPanel

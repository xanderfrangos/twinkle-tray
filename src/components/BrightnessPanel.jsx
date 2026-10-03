import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import Slider from "./Slider";
import DDCCISliders from "./DDCCISliders"
import HDRSliders from "./HDRSliders";
import TranslateReact from "../TranslateReact"
import getMonitorName from "../utils/BrightnessPanel/getMonitorName";

// Per-display opt-in: the primary slider drives the display's gamma ramp
// instead of the brightness control that was detected for it.
function usesGammaSlider(monitor) {
  if (!window.settings?.gammaAsMainSliderDisplays?.[monitor?.key]) return false
  return (monitor?.gammaBrightness >= 0)
}

const BrightnessPanel = memo(function BrightnessPanel() {

  const [state, setState] = useState({
    // The preload may receive monitor data before this component registers
    // its event listener, so begin with the latest available snapshot.
    monitors: window.allMonitors || {},
    hideDisplays: window.settings?.hideDisplays || {},
    linkedLevelsActive: false,
    names: {},
    update: false,
    sleeping: false,
    updateProgress: 0,
    isRefreshing: window.isRefreshing,
    // null until Windows Night Light status is known (or unsupported)
    nightLight: null,
    nightLightSupported: false,
    nightLightScheduleEnabled: false,
    nightLightReason: null,
    nightLightWarning: null,
    nightLightKnown: false,
    darkMode: false,
    darkModeMode: "light"
  })
  const [doBackgroundEvent, setDoBackgroundEvent] = useState(false)
  const [levelsChanged, setLevelsChanged] = useState(false)
  const [init, setInit] = useState(false)
  const [lastLevels, setLastLevels] = useState([])
  const [T] = useState(new TranslateReact({}, {}))
  const [, setLocalizationVersion] = useState(0)

  const numMonitors = useMemo(() => {
    let localNumMonitors = 0
    for (let key in state.monitors) {
      if ((state.monitors[key].type != "none" || state.monitors[key].hdr === "active") && !(state.hideDisplays?.[key] === true)) localNumMonitors++;
    }
    return localNumMonitors
  }, [state.monitors, state.hideDisplays])

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
    const hideDisplays = (settings.hideDisplays || {})
    setLevelsChanged(true)
    setState(prev => ({
      ...prev,
      linkedLevelsActive,
      remaps,
      names,
      hideDisplays,
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

  // Night Light is a global blue-light filter stored by Windows. The 0-100
  // slider maps 1-100 to "on at this warmth" and 0 to releasing the manual
  // override: Off when scheduling is disabled, Auto when it is enabled.
  //
  // Windows only re-applies a temperature change to the active filter while the
  // `previewColorTemperatureChanges` field is set (this is what Microsoft's own
  // slider does while dragging). So while the user adjusts we send throttled
  // "preview" writes, then a single committed write on release.
  const nightLightDesired = useRef(0)
  const nightLightPending = useRef(false)
  const nightLightDirty = useRef(false)
  const nightLightSettleTimer = useRef(null)
  const nightLightPreviewTimer = useRef(null)
  const nightLightFinalizeTimer = useRef(null)
  const nightLightCommitTimer = useRef(null)
  const nightLightLastPreviewAt = useRef(0)

  const NIGHT_LIGHT_PREVIEW_MS = 100
  const NIGHT_LIGHT_IDLE_COMMIT_MS = 600
  // Windows needs to observe the preview flag long enough to apply the new
  // temperature. On commit we re-assert a fresh preview and hold it for this
  // long before clearing the flag, so even a fast click gets a full apply frame.
  const NIGHT_LIGHT_MIN_PREVIEW_MS = 350

  const sendNightLight = (level, preview = false) => {
    window.setNightLight(level, { preview })
  }

  // Marks the start of a user-initiated change. Until a status matching the
  // requested value arrives (or the settle window expires), other statuses are
  // treated as stale echoes. This stops external/CloudStore updates from
  // yanking the thumb while the user is adjusting the slider.
  const beginNightLightChange = (value) => {
    nightLightDesired.current = value
    nightLightPending.current = true
    if (nightLightSettleTimer.current) clearTimeout(nightLightSettleTimer.current)
    nightLightSettleTimer.current = setTimeout(() => {
      nightLightSettleTimer.current = null
      nightLightPending.current = false
    }, 2000)
  }

  // Throttled transient preview: leading edge fires immediately, and a trailing
  // timer captures the newest value if changes are arriving faster than the cap.
  const scheduleNightLightPreview = (value) => {
    const elapsed = Date.now() - nightLightLastPreviewAt.current
    if (elapsed >= NIGHT_LIGHT_PREVIEW_MS) {
      if (nightLightPreviewTimer.current) {
        clearTimeout(nightLightPreviewTimer.current)
        nightLightPreviewTimer.current = null
      }
      nightLightLastPreviewAt.current = Date.now()
      sendNightLight(value, true)
    } else if (!nightLightPreviewTimer.current) {
      nightLightPreviewTimer.current = setTimeout(() => {
        nightLightPreviewTimer.current = null
        nightLightLastPreviewAt.current = Date.now()
        sendNightLight(nightLightDesired.current, true)
      }, NIGHT_LIGHT_PREVIEW_MS - elapsed)
    }
  }

  // Final, verified write. Called on release and by the idle safety timer.
  const sendNightLightFinal = () => {
    nightLightCommitTimer.current = null
    if (!nightLightDirty.current) return
    nightLightDirty.current = false
    sendNightLight(nightLightDesired.current, false)
  }

  const commitNightLight = () => {
    if (nightLightPreviewTimer.current) {
      clearTimeout(nightLightPreviewTimer.current)
      nightLightPreviewTimer.current = null
    }
    if (nightLightFinalizeTimer.current) {
      clearTimeout(nightLightFinalizeTimer.current)
      nightLightFinalizeTimer.current = null
    }
    if (!nightLightDirty.current) return

    // Re-assert the preview right now, then hold it before clearing so Windows
    // reliably applies the temperature (a click's original preview can be too
    // short-lived for the OS to act on).
    nightLightLastPreviewAt.current = Date.now()
    sendNightLight(nightLightDesired.current, true)

    if (nightLightCommitTimer.current) clearTimeout(nightLightCommitTimer.current)
    nightLightCommitTimer.current = setTimeout(sendNightLightFinal, NIGHT_LIGHT_MIN_PREVIEW_MS)
  }

  const handleNightLightChange = (level) => {
    const value = level * 1
    if (nightLightCommitTimer.current) {
      clearTimeout(nightLightCommitTimer.current)
      nightLightCommitTimer.current = null
    }
    beginNightLightChange(value)
    nightLightDirty.current = true
    setState(prev => ({ ...prev, nightLight: value }))
    scheduleNightLightPreview(value)
    // Safety net for input methods without a clean "release" (wheel/keyboard).
    if (nightLightFinalizeTimer.current) clearTimeout(nightLightFinalizeTimer.current)
    nightLightFinalizeTimer.current = setTimeout(() => {
      nightLightFinalizeTimer.current = null
      commitNightLight()
    }, NIGHT_LIGHT_IDLE_COMMIT_MS)
  }

  const recievedNightLight = (e) => {
    const status = e.detail || {}
    if (!status.supported) {
      nightLightPending.current = false
      setState(prev => ({
        ...prev,
        nightLightKnown: true,
        nightLightSupported: false,
        nightLight: null,
        nightLightScheduleEnabled: !!status.scheduleEnabled,
        nightLightReason: status.reason || "missing",
        nightLightWarning: status.warning || null
      }))
      return
    }
    const level = status.level ?? 0
    // Ignore stale echoes that don't match the value the user just requested.
    if (nightLightPending.current && level !== nightLightDesired.current) return
    nightLightPending.current = false
    if (nightLightSettleTimer.current) {
      clearTimeout(nightLightSettleTimer.current)
      nightLightSettleTimer.current = null
    }
    setState(prev => ({
      ...prev,
      nightLightKnown: true,
      nightLightSupported: true,
      nightLight: level,
      nightLightScheduleEnabled: !!status.scheduleEnabled,
      nightLightReason: null,
      nightLightWarning: status.warning || null
    }))
  }

  // Dark mode is a true Windows-backed switch. The main process owns the cycle
  // (Custom -> Dark -> Custom -> Light) and remembers the Apps/System split, so
  // the panel just asks for the next state and waits for the update.
  const toggleDarkMode = () => {
    window.toggleDarkMode()
  }

  const recievedDarkMode = (e) => {
    const status = e.detail || {}
    const mode = status.mode || (status.active ? "dark" : "light")
    setState(prev => ({ ...prev, darkMode: mode === "dark", darkModeMode: mode }))
  }

  useEffect(() => {
    resetBrightnessInterval()
    return () => {
      clearInterval(updateInterval)
    }
  }, [state.monitors, numMonitors, doBackgroundEvent, levelsChanged, init])


  useEffect(() => {
    const handleMonitorsUpdated = (e) => recievedMonitors(e)
    const handleSettingsUpdated = (e) => recievedSettings(e)
    const handleLocalizationUpdated = (e) => {
      T.setLocalizationData(e.detail.desired, e.detail.default)
      setLocalizationVersion(version => version + 1)
    }
    const handleUpdateUpdated = (e) => recievedUpdate(e)
    const handleSleepUpdated = (e) => recievedSleep(e)
    const handleRefreshingUpdated = (e) => handleIsRefreshingUpdate(e)
    const handleProgressUpdated = (e) => handleUpdateProgress(e)
    const handleNightLightUpdated = (e) => recievedNightLight(e)
    const handleDarkModeUpdated = (e) => recievedDarkMode(e)

    window.addEventListener("monitorsUpdated", handleMonitorsUpdated)
    window.addEventListener("settingsUpdated", handleSettingsUpdated)
    window.addEventListener("localizationUpdated", handleLocalizationUpdated)
    window.addEventListener("updateUpdated", handleUpdateUpdated)
    window.addEventListener("sleepUpdated", handleSleepUpdated)
    window.addEventListener("isRefreshing", handleRefreshingUpdated)
    window.addEventListener("nightLightUpdated", handleNightLightUpdated)
    window.addEventListener("darkModeUpdated", handleDarkModeUpdated)

    if (window.isAppX === false) {
      window.addEventListener("updateProgress", handleProgressUpdated)
    }

    // Update brightness every interval, if changed
    window.requestSettings()
    window.requestMonitors()
    window.requestNightLight()
    window.requestDarkMode()
    window.ipc.send('request-localization')
    window.reactReady = true

    return () => {
      window.removeEventListener("monitorsUpdated", handleMonitorsUpdated)
      window.removeEventListener("settingsUpdated", handleSettingsUpdated)
      window.removeEventListener("localizationUpdated", handleLocalizationUpdated)
      window.removeEventListener("updateUpdated", handleUpdateUpdated)
      window.removeEventListener("sleepUpdated", handleSleepUpdated)
      window.removeEventListener("isRefreshing", handleRefreshingUpdated)
      window.removeEventListener("updateProgress", handleProgressUpdated)
      window.removeEventListener("nightLightUpdated", handleNightLightUpdated)
      window.removeEventListener("darkModeUpdated", handleDarkModeUpdated)
      if (nightLightPreviewTimer.current) clearTimeout(nightLightPreviewTimer.current)
      if (nightLightFinalizeTimer.current) clearTimeout(nightLightFinalizeTimer.current)
      if (nightLightCommitTimer.current) clearTimeout(nightLightCommitTimer.current)
      if (nightLightSettleTimer.current) clearTimeout(nightLightSettleTimer.current)
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
          if(monitor.type == "wmi" || monitor.type == "studio-display" || monitor.type == "software" || (monitor.type == "ddcci" && monitor.brightnessType) || monitor.hdr === "active" || usesGammaSlider(monitor)) {
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
          if ((monitor.type == "none" && monitor.hdr !== "active" && !usesGammaSlider(monitor)) || window.settings?.hideDisplays?.[monitor.key] === true) {
            return (<div key={monitor.key}></div>)
          } else {
            if (monitor.type == "wmi" || monitor.type == "studio-display" || monitor.type == "software" || (monitor.type == "ddcci" && monitor.brightnessType) || monitor.hdr === "active" || usesGammaSlider(monitor)) {

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
              if((monitor.hdr === "active" || window.settings?.hdrDisplays?.[monitor.key]) && !(window.settings?.sdrAsMainSliderDisplays?.[monitor.key])) {
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
              const isHDROnlySDR = (monitor.hdr === "active" || monitor.hdr === "supported") && monitor.type === "none" && !usesGammaSlider(monitor);
              
              if (!useFeatures || !hasFeatures) {
                // For HDR displays that only support SDR, the HDR slider is displayed directly instead of the regular brightness slider.
                if (isHDROnlySDR) {
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

  // Global Windows controls (Night Light / dark mode) shown below the monitors.
  const nightLightAfterName = () => {
    const items = []
    if (state.nightLightWarning) {
      const warningKey = state.nightLightWarning === "per-device"
        ? "PANEL_NIGHT_LIGHT_WARNING_PER_DEVICE"
        : "PANEL_NIGHT_LIGHT_WARNING_SERVICES"
      items.push(<div key="warning" className="inline-warning" title={T.t(warningKey)}>{"\u26A0"}</div>)
    }
    if (state.nightLight === 0) {
      items.push(
        <div key="state" className="inline-state">
          {state.nightLightScheduleEnabled ? T.t("PANEL_LABEL_NIGHT_LIGHT_AUTO") : T.t("GENERIC_OFF")}
        </div>
      )
    }
    return items.length ? <>{items}</> : null
  }

  const getGlobalControls = () => {
    const wantNightLight = window.settings?.showNightLight
    const nightLightAvailable = state.nightLightSupported && state.nightLight !== null
    const showNightLight = wantNightLight && nightLightAvailable
    const showNightLightUnavailable = wantNightLight && state.nightLightKnown && !nightLightAvailable
    const showDarkMode = window.settings?.showDarkMode
    if (!showNightLight && !showNightLightUnavailable && !showDarkMode) return null

    const darkModeLabel = state.darkModeMode === "dark"
      ? T.t("GENERIC_ON")
      : (state.darkModeMode === "custom" ? T.t("GENERIC_CUSTOM") : T.t("GENERIC_OFF"))

    return (
      <div className="global-controls">
        {showNightLight && (
          <div className="monitor-sliders">
            <Slider name={T.t("PANEL_LABEL_NIGHT_LIGHT")} id="night-light" level={state.nightLight} min={0} max={100} num={0} hwid="night-light" key="night-light" onChange={handleNightLightChange} onCommit={commitNightLight} iconText={"\uE708"} syncLevel={true} afterName={nightLightAfterName()} scrollAmount={window.settings?.scrollFlyoutAmount} />
          </div>
        )}
        {showNightLightUnavailable && (
          <div className="global-toggle unavailable">
            <div className="name-row">
              <div className="icon"><span>&#xE708;</span></div>
              <div className="title">{T.t("PANEL_LABEL_NIGHT_LIGHT")}</div>
              <div className="state">{T.t("GENERIC_UNAVAILABLE")}</div>
              <div className="open-settings" title={T.t("PANEL_BUTTON_OPEN_NIGHT_LIGHT_SETTINGS")} onClick={window.openNightLightSettings}>&#xE713;</div>
            </div>
          </div>
        )}
        {showDarkMode && (
          <div className="global-toggle" data-active={state.darkModeMode} onClick={toggleDarkMode}>
            <div className="name-row">
              <div className="icon"><span>&#xE708;</span></div>
              <div className="title">{T.t("PANEL_LABEL_DARK_MODE")}</div>
              <div className="state">{darkModeLabel}</div>
            </div>
          </div>
        )}
      </div>
    )
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
      {!state.sleeping && getGlobalControls()}
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

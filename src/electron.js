const path = require('path');
const fs = require('fs')
require("os").setPriority(0, require("os").constants.priority.PRIORITY_BELOW_NORMAL)
const { nativeTheme, systemPreferences, Menu, ipcMain, app, screen, globalShortcut, powerMonitor } = require('electron')
const Utils = require("./Utils")

// Expose GC
app.commandLine.appendSwitch('js-flags', '--expose_gc --max-old-space-size=128')
require("v8").setFlagsFromString('--expose_gc'); global.gc = require("vm").runInNewContext('gc');

// Remove window animations
app.commandLine.appendSwitch('wm-window-animations-disabled');

let isDev = app.commandLine.hasSwitch("dev") 

const isAppX = (app.name == "twinkle-tray-appx" ? true : false)
const isPortable = (app.name == "twinkle-tray-portable" ? true : false)

const configFilesDir = (isPortable ? path.join(__dirname, "../../config/") : app.getPath("userData"))

const knownDisplaysPath = path.join(configFilesDir, `\\known-displays${(isDev ? "-dev" : "")}.json`)
let updateKnownDisplaysTimeout

// Handle multiple instances before continuing
const singleInstanceLock = app.requestSingleInstanceLock(process.argv)
if (!singleInstanceLock) {
  try { Utils.handleProcessedArgs(Utils.processArgs(process.argv, app), knownDisplaysPath) } catch (e) { }
  app.exit()
} else {
  console.log("Starting Twinkle Tray...")
  app.on('second-instance', handleCommandLine)
}

require('@electron/remote/main').initialize()

const knownDDCBrightnessVCPs = require('./known-ddc-brightness-codes.json')

const { fork, exec } = require('child_process');
const uuid = require('uuid/v4');
const { VerticalRefreshRateContext, addDisplayChangeListener } = require("win32-displayconfig");
const refreshCtx = new VerticalRefreshRateContext();

const WindowUtils = require("setwindowpos-binding")
const setWindowPos = () => {}
const AccentColors = require("windows-accent-colors")
const Acrylic = require("acrylic")

const ActiveWindow = require('@paymoapp/active-window').default;
ActiveWindow.initialize(10)

const reg = require('native-reg');
const Color = require('color')
const Translate = require('./Translate');
const { EventEmitter } = require("events");

const isReallyWin11 = (require("os").release()?.split(".")[2] * 1) >= 22000
const isAtLeast1803 = (require("os").release()?.split(".")[2] * 1) >= 17134

app.allowRendererProcessReuse = true

// Logging
const logPath = path.join(configFilesDir, `\\debug${(isDev ? "-dev" : "")}.log`)
const updatePath = path.join(configFilesDir, `\\update.exe`)

// Remove old log
if (fs.existsSync(logPath)) {
  try {
    fs.unlinkSync(logPath)
  } catch (e) {
    console.log("Couldn't delete log file")
  }
}

const log = async (...args) => {
  for (let arg of args) {
    console.log(arg, "\r\n")
    fs.appendFile(logPath, arg.toString(), () => { })
  }
}

const debug = {
  log,
  error: log
}

if (!isDev && !app.commandLine.hasSwitch("console") ) console.log = () => { };


const windowMenu = Menu.buildFromTemplate([{
  label: "Dev Tools",
  role: "toggleDevTools",
  accelerator: "Ctrl+Shift+I"
}])




// Monitors thread
// Handles WMI + DDC/CI activity

let monitorsThread = {
  send: function(data) {
    try {
      if (monitorsThreadReal && !monitorsThreadReal.connected) {
        startMonitorThread()
      }
      monitorsThreadReal.send(data)
    } catch(e) {
      console.log("Couldn't communicate with Monitor thread.", e)
    }
  },
  once: function (message, data) {
    try {
      if (monitorsThreadReal && !monitorsThreadReal.connected) {
        startMonitorThread()
      }
      monitorsEventEmitter.once(message, data)
    } catch (e) {
      console.log("Couldn't listen to Monitor thread.", e)
    }
  }
}
let monitorsThreadReal
let monitorsEventEmitter = new EventEmitter()
function startMonitorThread() {
  monitorsThreadReal = fork(path.join(__dirname, 'Monitors.js'), ["--isdev=" + isDev, "--apppath=" + app.getAppPath()], { silent: false })
  monitorsThreadReal.on("message", (data) => {
    if(data?.type) {
      monitorsEventEmitter.emit(data.type, data)
      if(data.type === "ready") {
        monitorsThreadReal.send({
          type: "settings",
          settings
        })
        monitorsThreadReal.send({
          type: "ddcBrightnessVCPs",
          ddcBrightnessVCPs: getDDCBrightnessVCPs()
        })
      }
    }
  })
}
startMonitorThread()



// Test if wmi-bridge works properly on user's system
let monitorsThreadTest
function startMonitorTestThread() {
  monitorsThreadTest = fork(path.join(__dirname, 'wmi-bridge-test.js'), ["--isdev=" + isDev, "--apppath=" + app.getAppPath()], { silent: false })
  monitorsThreadTest.on("message", (data) => {
    if(data?.type === "ready") {
      console.log("WMI-BRIDGE TEST: READY")
    }
    if(data?.type === "ok") {
      console.log("WMI-BRIDGE TEST: OK")
      monitorsThread.send({
        type: "wmi-bridge-ok"
      })
    }
  })
  // Close after timeout
  setTimeout(() => {
    try {
      if(monitorsThreadTest.connected) {
        console.log("WMI-BRIDGE TEST: Killing thread")
        monitorsThreadTest.kill()
      }
    } catch(e) { console.log(e) }
  }, 2000)
}
startMonitorTestThread()


// Mouse wheel scrolling
let mouseEventsActive = false
let mouseEvents
let bounds

function enableMouseEvents() {
  if (mouseEventsActive || settings.disableMouseEvents) return false;
  mouseEventsActive = true;

  try {
    mouseEvents = require("global-mouse-events");
    mouseEvents.on('mousewheel', event => {
      if (!settings.scrollShortcut) return false;
      try {
        if (!bounds) return false;
        if (event.x >= bounds.x && event.x <= bounds.x + bounds.width && event.y >= bounds.y && event.y <= bounds.y + bounds.height) {
          const amount = Math.round(event.delta) * 2;

          refreshMonitors()
          updateAllBrightness(amount)

          // If panel isn't open, use the overlay
          if (panelState !== "visible") {
            hotkeyOverlayStart(undefined, true)
          }

          pauseMonitorUpdates() // Pause monitor updates to prevent judder
          willPauseMouseEvents() // Delay pausing mouse events

        }
      } catch (e) {
        console.error(e)
      }
    });


    // Handle edge cases where "blur" event doesn't properly fire
    mouseEvents.on("mousedown", (e) => {
      if (panelSize.visible || !canReposition) {

        // Check if clicking outside of panel/overlay
        const pBounds = screen.dipToScreenRect(mainWindow, mainWindow.getBounds())
        if (e.x < pBounds.x || e.x > pBounds.x + pBounds.width || e.y < pBounds.y || e.y > pBounds.y + pBounds.height) {
          if (!canReposition) {
            // Overlay is displayed
            hotkeyOverlayHide(true)
          } else {
            // Panel is displayed
            if(!mainWindow.webContents.isDevToolsOpened()) {
              sendToAllWindows("panelBlur")
              showPanel(false)
            }
          }
        }

      }
    })

  } catch (e) {
    console.error(e)
  }

}

function pauseMouseEvents(paused) {

  // Clear timeout if set
  if(willPauseMouseEventsTimeout) clearTimeout(willPauseMouseEventsTimeout);

  if(paused) {
    if(mouseEvents && !mouseEvents.getPaused()) {
      console.log("Pausing mouse events...")
      mouseEvents.pauseMouseEvents()
    }
  } else {
    if(mouseEvents && mouseEvents.getPaused()) {
      console.log("Resuming mouse events...")
      mouseEvents.resumeMouseEvents()
    }
  }
}

let willPauseMouseEventsTimeout
function willPauseMouseEvents(time = 10000) {
  if(willPauseMouseEventsTimeout) clearTimeout(willPauseMouseEventsTimeout);
  willPauseMouseEventsTimeout = setTimeout(() => {
    pauseMouseEvents(true)
    willPauseMouseEventsTimeout = null
  }, time)
}




// Analytics
let analyticsInterval = false
let analyticsFrequency = 1000 * 60 * 29 // 29 minutes
let lastAnalyticsPing = 0

function pingAnalytics() {
  // Skip if too recent
  if(Date.now() < lastAnalyticsPing + (1000*60*28)) return false;
  
  const analytics = require('ga4-mp').createClient("Y1YTliQdTL-moveI0z1TLA", "G-BQ22ZK4BPY", settings.uuid)
  console.log("\x1b[34mAnalytics:\x1b[0m sending with UUID " + settings.uuid)

  let events = []
  events.push({
    name: "page_view",
    params: {
      page_location: app.name + "/" + "v" + app.getVersion(),
      page_title: app.name + "/" + "v" + app.getVersion(),
      page_referrer: app.name,
      os_version: require("os").release(),
      app_type: app.name,
      app_version: app.getVersion(),
      engagement_time_msec: 1
    }
  })
  analytics.send(events)
  lastAnalyticsPing = Date.now()
}

let monitors = {}
let mainWindow;
let tray = null
let lastTheme = false

const panelSize = {
  width: 356,
  height: 500,
  base: 0,
  visible: false,
  taskbar: {}
}

//
//
//    Settings init
//
//

if (!fs.existsSync(configFilesDir)) {
  try {
    fs.mkdirSync(configFilesDir, { recursive: true })
  } catch (e) {
    debug.error(e)
  }
}

const settingsPath = path.join(configFilesDir, `\\settings${(isDev ? "-dev" : "")}.json`)

const defaultSettings = {
  isDev,
  userClosedIntro: false,
  theme: "default",
  icon: "icon",
  updateInterval: 500,
  openAtLogin: true,
  brightnessAtStartup: true,
  killWhenIdle: false,
  remaps: {},
  hotkeys: {},
  hotkeyPercent: 10,
  adjustmentTimes: [],
  adjustmentTimeIndividualDisplays: false,
  adjustmentTimeSpeed: "normal",
  adjustmentTimeAnimate: false,
  checkTimeAtStartup: true,
  order: [],
  monitorFeatures: {},
  hideDisplays: {},
  checkForUpdates: !isDev,
  dismissedUpdate: '',
  language: "system",
  settingsVer: "v" + app.getVersion(),
  names: {},
  analytics: !isDev,
  scrollShortcut: true,
  useAcrylic: false,
  useNativeAnimation: false,
  sleepAction: "ps",
  hotkeysBreakLinkedLevels: true,
  enableSunValley: true,
  isWin11: isReallyWin11,
  windowsStyle: "system",
  hideClosedLid: false,
  getDDCBrightnessUpdates: false,
  detectIdleTimeEnabled: false,
  detectIdleTimeSeconds: 0,
  detectIdleTimeMinutes: 5,
  overrideTaskbarPosition: false,
  overrideTaskbarGap: false,
  disableWMIC: false,
  disableWMI: false,
  disableWin32: false,
  autoDisabledWMI: false,
  disableOverlay: false,
  disableMouseEvents: false,
  disableThrottling: false,
  userDDCBrightnessVCPs: {},
  forceLowPowerGPU: false,
  ddcPowerOffValue: 6,
  disableAutoRefresh: false,
  disableAutoApply: false,
  profiles: [],
  uuid: uuid(),
  branch: "master"
}

const tempSettings = {
  pauseTimeAdjustments: false,
  pauseIdleDetection: false
}

Utils.unloadModule("uuid/v4")

let settings = Object.assign({}, defaultSettings)

function readSettings(doProcessSettings = true) {
  try {
    if (fs.existsSync(settingsPath)) {
      settings = Object.assign(settings, JSON.parse(fs.readFileSync(settingsPath)))
    } else {
      fs.writeFileSync(settingsPath, JSON.stringify({}))
    }
    //debug.log('Settings loaded:', settings)
  } catch (e) {
    debug.error("Couldn't load settings", e)
  }

  // Overrides
  settings.isDev = isDev
  settings.killWhenIdle = false

  if(settings.updateInterval === 999) settings.updateInterval = 100;

  // Upgrade settings
  if(Utils.getVersionValue(settings.settingsVer) < Utils.getVersionValue("v1.15.0")) {
    // v1.15.0
    try {
      const upgradedTimes = Utils.upgradeAdjustmentTimes(settings.adjustmentTimes)
      settings.adjustmentTimes = upgradedTimes
      console.log("Upgraded Adjustment Times to v1.15.0 format!")
    } catch(e) {
      console.log("Couldn't upgrade Adjustment Times", e)
    }
    try {
      if(settings.detectIdleTime) {
        if(settings.detectIdleTime * 1 > 0) {
          settings.detectIdleTimeEnabled = true
          settings.detectIdleTimeSeconds = (settings.detectIdleTime * 1) % 60
          settings.detectIdleTimeMinutes = Math.floor((settings.detectIdleTime * 1) / 60)
        }
        delete settings.detectIdleTime
      }
      console.log("Upgraded Idle settings to v1.15.0 format!")
    } catch(e) {
      console.log("Couldn't upgrade Idle settings", e)
    }
  }


  if(doProcessSettings) processSettings({isReadSettings: true});
}

readSettings(false)
if(settings.disableThrottling) {
  // Prevent background throttling
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
}

if(settings.forceLowPowerGPU) {
  app.commandLine.appendSwitch('force_low_power_gpu')
}

let writeSettingsTimeout = false
function writeSettings(newSettings = {}, processAfter = true, sendUpdate = true) {
  settings = Object.assign(settings, newSettings)

  if (!writeSettingsTimeout) {
    writeSettingsTimeout = setTimeout(() => {
      // Save new settings
      try {
        fs.writeFile(settingsPath, JSON.stringify(settings, null, '\t'), (e) => { if (e) debug.error(e) })
      } catch (e) {
        debug.error("Couldn't save settings.", settingsPath, e)
      }
      writeSettingsTimeout = false
    }, 333)
  }

  if (processAfter) processSettings(newSettings, sendUpdate);
}


function processSettings(newSettings = {}, sendUpdate = true) {

  let doRestartPanel = false
  let rebuildTray = false

  try {

    settings.settingsVer = "v" + app.getVersion()

    if (settings.theme) {
      nativeTheme.themeSource = determineTheme(settings.theme)
    }

    updateStartupOption((settings.openAtLogin || false))
    applyOrder()
    applyRemaps()

    if (settings.killWhenIdle && mainWindow && mainWindow.isAlwaysOnTop() === false) {
      mainWindow.close()
    }

    if (newSettings.adjustmentTimes !== undefined) {
      lastTimeEvent = false
      restartBackgroundUpdate()
      rebuildTray = true
    }

    if (newSettings.hotkeys !== undefined) {
      applyHotkeys()
    }

    if (newSettings.language !== undefined) {
      getLocalization()
      rebuildTray = true
    }

    if (newSettings.order !== undefined) {
      doRestartPanel = true
    }

    if(newSettings.detectIdleTimeEnabled === true || newSettings.detectIdleTimeEnabled === false) {
      rebuildTray = true
    }

    if(newSettings.windowsStyle !== undefined) {
      if(newSettings.windowsStyle === "win11") {
        settings.isWin11 = true
      } else if(newSettings.windowsStyle === "win10") {
        settings.isWin11 = false
      } else {
        settings.isWin11 = isReallyWin11
      }
      newSettings.useAcrylic = settings.useAcrylic
      doRestartPanel = true
    }

    if (newSettings.useAcrylic !== undefined) {
      lastTheme["UseAcrylic"] = newSettings.useAcrylic
      sendToAllWindows('theme-settings', lastTheme)
      sendMicaWallpaper()
      doRestartPanel = true
    }

    if (newSettings.icon !== undefined) {
      if (tray) {
        tray.setImage(getTrayIconPath())
      }
    }

    if (newSettings.checkForUpdates !== undefined) {
      if (newSettings.checkForUpdates === false) {
        latestVersion = false
        sendToAllWindows('latest-version', latestVersion);
      } else {
        lastCheck = false
      }
    }

    if (newSettings.isDev === true || newSettings.isDev === false) {
      rebuildTray = true
    }

    if (newSettings.branch) {
      lastCheck = false
      settings.dismissedUpdate = false
      checkForUpdates()
    }

    if (settings.analytics) {
      pingAnalytics()
      if (analyticsInterval) {
        clearInterval(analyticsInterval)
      }
      analyticsInterval = setInterval(pingAnalytics, analyticsFrequency)
    } else {
      analytics = false
      if (analyticsInterval) {
        clearInterval(analyticsInterval)
      }
    }

    if (rebuildTray) {
      setTrayMenu()
    }

    if (mainWindow && doRestartPanel) {
      restartPanel()
    }

  } catch (e) {
    console.log("Couldn't process settings!", e)
  }

  monitorsThread.send({
    type: "settings",
    settings: settings
  })
  monitorsThreadReal.send({
    type: "ddcBrightnessVCPs",
    ddcBrightnessVCPs: getDDCBrightnessVCPs()
  })

  if(sendUpdate) sendToAllWindows('settings-updated', settings);
}

// Save all known displays to disk for future use
async function updateKnownDisplays(force = false, immediate = false) {

  // Skip when idle
  if(!force && isUserIdle) return false;

  const doFunc = () => {
    try {
      // Get from file
      let known = getKnownDisplays(true)

      // Save to memory
      lastKnownDisplays = known

      // Write back to file
      fs.writeFileSync(knownDisplaysPath, JSON.stringify(known))
      console.log(`\x1b[36mSaved known displays!\x1b[0m`)
    } catch (e) {
      console.error("Couldn't update known displays file.")
    }
  }

  // Reset timeout
  if (updateKnownDisplaysTimeout) clearTimeout(updateKnownDisplaysTimeout);

  if(immediate) {
    doFunc()
  } else {
    // Wait a moment
    updateKnownDisplaysTimeout = setTimeout(doFunc, 3000)
  }

}

// Get known displays from file, along with current displays
let lastKnownDisplays
function getKnownDisplays(useCurrentMonitors) {
  let known
  if(!lastKnownDisplays) {
    try {
      // Load known displays DB
      known = fs.readFileSync(knownDisplaysPath)
      known = JSON.parse(known)
      lastKnownDisplays = known
    } catch (e) {
      known = {}
    }
  } else {
    known = lastKnownDisplays
  }

  // Merge with existing displays
  if (useCurrentMonitors) {
    known = Object.assign(known, JSON.parse(JSON.stringify(monitors)))
  }

  return known
}

// Look up all known displays and re-apply last brightness
function setKnownBrightness(useCurrentMonitors = false, useTransition = false, transitionSpeed = 1) {

  console.log(`\x1b[36mSetting brightness for known displays\x1b[0m`, useCurrentMonitors, useTransition, transitionSpeed)

  const known = getKnownDisplays(useCurrentMonitors)
  applyProfile(known, useTransition, transitionSpeed)
}

function applyProfile(profile = {}, useTransition = false, transitionSpeed = 1) {

  applyOrder(profile)
  applyRemaps(profile)  

  if(useTransition) {
    // If using smooth transition
    let transitionMonitors = []
    for (const hwid in profile) {
      try {
        const monitor = profile[hwid]
        transitionMonitors[monitor.id] = monitor.brightness
      } catch (e) { console.log("Couldn't set brightness for known display!") }
    }
    transitionBrightness(50, transitionMonitors, transitionSpeed)
  } else {
    // If not using a transition
    for (const hwid in profile) {
      try {
        const monitor = profile[hwid]
  
        // Apply brightness to valid display types
        if (monitor.type == "wmi" || (monitor.type == "ddcci" && monitor.brightnessType)) {
          updateBrightness(monitor.id, monitor.brightness)
        }
      } catch (e) { console.log("Couldn't set brightness for known display!") }
    }
  }
  
  sendToAllWindows('monitors-updated', monitors);
}


function applyHotkeys(monitorList = monitors) {
  if (settings.hotkeys !== undefined) {
    globalShortcut.unregisterAll()
    for (let hotkey of Object.values(settings.hotkeys)) {
      try {
        // Only apply if found
        if (hotkey.monitor == "all" || hotkey.monitor == "turn_off_displays" || Object.values(monitorList).find(m => m.id == hotkey.monitor)) {
          hotkey.active = globalShortcut.register(hotkey.accelerator, () => {
            doHotkey(hotkey)
          })
        }
      } catch (e) {
        // Couldn't register hotkey
      }

    }
    sendToAllWindows('settings-updated', settings)
  }
}

let hotkeyOverlayTimeout
let hotkeyThrottle = []
let doingHotkey = false
const doHotkey = async (hotkey) => {
  const now = Date.now()
  if (!doingHotkey && (hotkeyThrottle[hotkey.monitor] === undefined || now > hotkeyThrottle[hotkey.monitor] + 100)) {
    hotkeyThrottle[hotkey.monitor] = now


    let showOverlay = true

    doingHotkey = true

    try {
      if (hotkey.monitor === "all" || ((settings.linkedLevelsActive && !settings.hotkeysBreakLinkedLevels) && hotkey.monitor != "turn_off_displays")) {

        // Wait for refresh if user hasn't done so recently
        if(lastRefreshMonitors < Date.now() - 10000) {
          await refreshMonitors()
        }

        let linkedLevelVal = false
        for (let key in monitors) {
          const monitor = monitors[key]
          let normalizedAdjust = minMax((settings.hotkeyPercent * hotkey.direction) + monitor.brightness)

          // Use linked levels, if applicable
          if (settings.linkedLevelsActive) {
            // Set shared brightness value if not set
            if (linkedLevelVal) {
              normalizedAdjust = linkedLevelVal
            } else {
              linkedLevelVal = normalizedAdjust
            }
          }

          monitors[key].brightness = normalizedAdjust
        }

        sendToAllWindows('monitors-updated', monitors);
        for (let key in monitors) {
          updateBrightnessThrottle(monitors[key].id, monitors[key].brightness, true, false)
        }
        pauseMonitorUpdates() // Stop incoming updates for a moment to prevent judder

      } else if (hotkey.monitor == "turn_off_displays") {
        showOverlay = false
        sleepDisplays(settings.sleepAction)
      } else {
        if (Object.keys(monitors).length) {
          const monitor = Object.values(monitors).find((m) => m.id == hotkey.monitor)
          if (monitor) {
            let normalizedAdjust = minMax((settings.hotkeyPercent * hotkey.direction) + monitor.brightness)
            monitors[monitor.key].brightness = normalizedAdjust
            sendToAllWindows('monitors-updated', monitors);
            updateBrightnessThrottle(monitor.id, monitors[monitor.key].brightness, true, false)
            pauseMonitorUpdates() // Stop incoming updates for a moment to prevent judder

            // Break linked levels
            if(settings.hotkeysBreakLinkedLevels && settings.linkedLevelsActive) {
              console.log("Breaking linked levels due to hotkey.")
              writeSettings({linkedLevelsActive: false})
            } 
          }
        }
      }

      // Show brightness overlay, if applicable
      // If panel isn't open, use the overlay
      if (showOverlay && panelState !== "visible") {
        hotkeyOverlayStart(undefined, true)
      }

    } catch (e) {
      console.log("HOTKEY ERROR:", e)
    }

    doingHotkey = false

  }
}

function hotkeyOverlayStart(timeout = 3000, force = true) {
  if(settings.disableOverlay || currentProfile?.overlayType === "disabled") return false;
  if (canReposition) {
    hotkeyOverlayShow()
  }
  // Resume mouse events if disabled
  pauseMouseEvents(false)

  if(hotkeyOverlayTimeout) clearTimeout(hotkeyOverlayTimeout);
  hotkeyOverlayTimeout = setTimeout(() => hotkeyOverlayHide(force), timeout)
}

async function hotkeyOverlayShow() {
  if(settings.disableOverlay) return false;
  if (!mainWindow) return false;
  if(startHideTimeout) clearTimeout(startHideTimeout);
  startHideTimeout = null;
  
  mainWindow.showInactive()

  setAlwaysOnTop(true)
  sendToAllWindows("display-mode", "overlay")
  panelState = "overlay"
  let monitorCount = 0
  Object.values(monitors).forEach((monitor) => {
    if ((monitor.type === "ddcci" || monitor.type === "wmi") && (settings?.hideDisplays?.[monitor.key] !== true)) monitorCount++;
  })

  if (monitorCount && settings.linkedLevelsActive) {
    monitorCount = 1
  }

  canReposition = false
  if (settings.useAcrylic) {
    tryVibrancy(mainWindow, { theme: "#26262601", effect: "blur" })
  }
  await toggleTray(true, true)

  if(settings?.isWin11) {
    const panelHeight = 14 + 36 + (28 * monitorCount)
    const panelWidth = 216
    const primaryDisplay = screen.getPrimaryDisplay()
    const bounds = {
      width: panelWidth,
      height: panelHeight,
      x: parseInt((primaryDisplay.workArea.width - panelWidth) / 2),
      y: parseInt(primaryDisplay.workArea.height - panelHeight)
    }
    mainWindow.setBounds(bounds)
  } else {
    // Win10 style
    const panelOffset = 40
    mainWindow.setBounds({
      width: 26 + (40 * monitorCount),
      height: 138,
      x: panelOffset + 10 + (panelSize.taskbar.position === "LEFT" ? panelSize.taskbar.gap : 0),
      y: panelOffset + 20
    })
  }

  // Dumb stuff to prevent UI flicker
  setTimeout(() => {
    sendToAllWindows("display-mode", "overlay")
    setTimeout(() => {
      mainWindow.setOpacity(1)
    }, 33)
  }, 66)
}

function hotkeyOverlayHide(force = true) {
  if (!mainWindow) {
    hotkeyOverlayStart(333)
    return false
  }

  if (!force && mainWindow && mainWindow.isFocused()) {
    hotkeyOverlayStart(333)
    return false;
  }

  clearTimeout(hotkeyOverlayTimeout)
  setAlwaysOnTop(false)
  canReposition = true
  if(!mainWindow.webContents.isDevToolsOpened()) {
    sendToAllWindows("panelBlur")
    showPanel(false)
    sendToAllWindows("display-mode", "normal")
  }
  hotkeyOverlayTimeout = false

  // Pause mouse events if scroll shortcut is not enabled
  pauseMouseEvents(true)

  mainWindow.setSize(0, 0)
  
  if (!settings.useAcrylic || !settings.useNativeAnimation) {
    tryVibrancy(mainWindow, false)
  }
}

function applyOrder(monitorList = monitors) {
  for (let key in monitorList) {
    const monitor = monitorList[key]
    for (let order of settings.order) {
      if (monitor.id == order.id) {
        monitor.order = order.order
      }
    }
  }
}

function applyRemaps(monitorList = monitors) {
  for (let key in monitorList) {
    const monitor = monitorList[key]
    applyRemap(monitor)
  }
}

function applyRemap(monitor) {
  if (settings.remaps) {
    for (let remapName in settings.remaps) {
      if (remapName == monitor.name || remapName == monitor.id) {
        let remap = settings.remaps[remapName]
        monitor.min = remap.min
        monitor.max = remap.max
        // Stop if using new scheme
        if (remapName == monitor.id) return monitor;
      }
    }
  }
  return monitor
}

function minMax(value, min = 0, max = 100) {
  let out = value
  if (value < min) out = min;
  if (value > max) out = max;
  return out;
}

function determineTheme(themeName) {
  theme = themeName.toLowerCase()
  if (theme === "dark" || theme === "light") return theme;
  if (lastTheme && lastTheme.SystemUsesLightTheme) {
    return "light"
  } else {
    return "dark"
  }
}


async function updateStartupOption(openAtLogin) {
  if (!isDev)
    app.setLoginItemSettings({ openAtLogin })

  // Set autolaunch for AppX
  try {
    if (isAppX) {
      const { WindowsStoreAutoLaunch } = require('electron-winstore-auto-launch');
      if (openAtLogin) {
        WindowsStoreAutoLaunch.enable()
      } else {
        WindowsStoreAutoLaunch.disable()
      }
      Utils.unloadModule('electron-winstore-auto-launch')
    }
  } catch (e) {
    debug.error(e)
  }
}



//
//
//    Localization
//
//



const localization = {
  detected: "en",
  default: {},
  desired: {},
  all: [],
  languages: []
}
let T = new Translate(localization.desired, localization.default)
function getLocalization() {
  // Detect language
  let detected = app.getLocale()

  if(detected === "zh-CN") {
    detected = "zh_Hans"
  } else if(detected === "zh-TW" || detected === "zh-HK" || detected === "zh-MO") {
    detected = "zh-Hant"
  } else if(detected?.split("-")[0] === "pt") {
    detected = app.getLocale()
  } else {
    detected = detected?.split("-")[0]
  }

  // Use detected if user has not selected one
  localization.detected = (settings.language == "system" ? detected : settings.language)

  // Get default localization file
  try {
    const defaultFile = fs.readFileSync(path.join(__dirname, `/localization/en.json`))
    localization.default = JSON.parse(defaultFile)
  } catch (e) {
    console.error("Couldn't read default langauge file!")
  }

  // Get user's local localization file, if available
  localization.desired = {}
  const langPath = path.join(__dirname, `/localization/${localization.detected}.json`)
  if (fs.existsSync(langPath)) {
    try {
      const desiredFile = fs.readFileSync(langPath)
      localization.desired = JSON.parse(desiredFile)
    } catch (e) {
      console.error(`Couldn't read language file: ${localization.detected}.json`)
    }
  }

  T = new Translate(localization.desired, localization.default)
  sendToAllWindows("localization-updated", localization)

  monitorsThread.send({
    type: "localization",
    localization: {
      GENERIC_DISPLAY_SINGLE: T.getString("GENERIC_DISPLAY_SINGLE")
    }
  })

}

async function getAllLanguages() {
  return new Promise((resolve, reject) => {
    fs.readdir(path.join(__dirname, `/localization/`), (err, files) => {
      if (!err) {
        let languages = []
        for (let file of files) {
          try {
            const langText = fs.readFileSync(path.join(__dirname, `/localization/`, file))
            const langName = JSON.parse(langText)["LANGUAGE"]

            if (!langName || langName.length === 0) {
              throw ("Invalid language.")
            }

            languages.push({
              id: file.split(".")[0],
              name: langName
            })
          } catch (e) {
            console.error(`Error reading language from ${file}`)
          }
        }
        localization.languages = languages
        sendToAllWindows("localization-updated", localization)
        resolve(languages)
      } else {
        reject()
      }
    })
  })
}

ipcMain.on('request-localization', () => { sendToAllWindows("localization-updated", localization) })

function getSettings() {
  processSettings({})
  sendToAllWindows('settings-updated', settings)
}

function getDDCBrightnessVCPs() {
  try {
    let ids = Object.assign(knownDDCBrightnessVCPs, settings.userDDCBrightnessVCPs)
    for(let mon in ids) {
      ids[mon] = parseInt(ids[mon])
    }
    return ids
  } catch(e) {
    console.log("Couldn't generate DDC Brightness IDs!", e)
    return {}
  }
}

function sendToAllWindows(eventName, data) {
  if (mainWindow) {
    mainWindow.webContents.send(eventName, data)
  }
  if (settingsWindow) {
    settingsWindow.webContents.send(eventName, data)
  }
  if (introWindow) {
    introWindow.webContents.send(eventName, data)
  }
}

ipcMain.on('send-settings', (event, data) => {
  console.log("Recieved new settings", data.newSettings)
  writeSettings(data.newSettings, true, data.sendUpdate)
})

ipcMain.on('request-settings', (event) => {
  getSettings()
  getThemeRegistry() // Technically, it doesn't belong here, but it's a good place to piggy-back off of
})

ipcMain.on('reset-settings', () => {
  settings = Object.assign({}, defaultSettings)
  console.log("Resetting settings")
  lastKnownDisplays = {}
  fs.writeFileSync(knownDisplaysPath, JSON.stringify(lastKnownDisplays))
  writeSettings({ userClosedIntro: true })
})

// Get the user's Windows Personalization settings
async function getThemeRegistry() {
  console.log("Function: getThemeRegistry");

  if (lastTheme) sendToAllWindows('theme-settings', lastTheme)

  const themeSettings = {};
  try {
    const key = reg.openKey(reg.HKCU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', reg.Access.ALL_ACCESS);

    themeSettings.AppsUseLightTheme = reg.getValue(key, null, 'AppsUseLightTheme');
    themeSettings.EnableTransparency = reg.getValue(key, null, 'EnableTransparency');
    themeSettings.SystemUsesLightTheme = reg.getValue(key, null, 'SystemUsesLightTheme');
    themeSettings.ColorPrevalence = reg.getValue(key, null, 'ColorPrevalence');
  } catch(e) {
    console.log("Couldn't access theme registry", e)
  }

  themeSettings.UseAcrylic = settings.useAcrylic
  if (themeSettings.ColorPrevalence) {
    if (settings.theme == "dark" || settings.theme == "light") {
      themeSettings.ColorPrevalence = false
    }
  }

  // Send it off!
  sendToAllWindows('theme-settings', themeSettings)
  lastTheme = themeSettings
  if (tray) {
    tray.setImage(getTrayIconPath())
  }

  // Taskbar position
  // For use only if auto-hide is on
  try {
    const key = reg.openKey(reg.HKCU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StuckRects3', reg.Access.ALL_ACCESS);

    const Settings = reg.getValue(key, null, 'Settings');
    taskbarPos = Settings[12] * 1
    detectedTaskbarHeight = Settings[20] * 1
    detectedTaskbarHide = (Settings[8] * 1 === 3 ? true : false) // 3 = auto-hide

    if (taskbarPos !== null || settings.useTaskbarRegistry) {
      switch (taskbarPos) {
        case 0: detectedTaskbarPos = "LEFT"; break;
        case 1: detectedTaskbarPos = "TOP"; break;
        case 2: detectedTaskbarPos = "RIGHT"; break;
        case 3: detectedTaskbarPos = "BOTTOM"; break;
      }
    }
  } catch(e) {
    console.log("Couldn't access taskbar registry", e)
  }

  return true
}

function getTrayIconPath() {
  const themeDir = (lastTheme && lastTheme.SystemUsesLightTheme ? 'light' : 'dark')
  let icon = "icon";
  if (settings.icon === "mdl2" || settings.icon === "fluent") {
    icon = settings.icon
  }
  return path.join(__dirname, `assets/tray-icons/${themeDir}/${icon}.ico`)
}

function getAccentColors() {
  let detectedAccent = "0078d7"
  const colors = AccentColors.getAccentColors()
  try {
    if (systemPreferences.getAccentColor().length == 8)
      detectedAccent = systemPreferences.getAccentColor().substr(0, 6)
  } catch (e) { console.log("Couldn't get accent color from registry!") }
  const accent = Color("#" + detectedAccent, "hex")
  const matchLumi = (color, level) => {
    let adjusted = color.hsl()
    adjusted.color[2] = (level * 100)
    return adjusted
  }
  let adjustedAccent = accent
  if (accent.hsl().color[2] > 60) adjustedAccent = matchLumi(accent, 0.6);
  if (accent.hsl().color[2] < 40) adjustedAccent = matchLumi(accent, 0.4);

  // Start w/ old format
  let outColors = {
    accent: adjustedAccent.hex(),
    lighter: matchLumi(accent, 0.85).hex(),
    light: matchLumi(accent, 0.52).hex(),
    medium: matchLumi(accent, 0.48).hex(),
    mediumDark: matchLumi(accent, 0.33).desaturate(0.1).hex(),
    dark: matchLumi(accent, 0.275).desaturate(0.1).hex(),
    transparent: matchLumi(accent, 0.275).desaturate(0.1).rgb().string(),
  }

  // Merge in new format
  outColors = Object.assign(outColors, colors)
  
  return outColors
}

function tryVibrancy(window, value = null) {
  if (!window) return false;
  try {
    if(!settings.useAcrylic || settings.isWin11 || value === false) {
      window.setBackgroundColor("#00000000")
      Acrylic.disableAcrylic(window.getNativeWindowHandle().readInt32LE(0))
      return false
    }
    const color = Color((typeof value === "string" ? value : value.theme))
    Acrylic.setAcrylic(window.getNativeWindowHandle().readInt32LE(0), 1, color.red(), color.green(), color.blue(), parseInt(color.alpha() * 255))
  }
  catch (e) {
    console.log("Couldn't set vibrancy", e)
  }
}


//
//
//    Monitor updates
//
//

let isRefreshing = false
let shouldShowPanel = false


refreshMonitorsJob = async (fullRefresh = false) => {
  return await new Promise((resolve, reject) => {
    try {
      monitorsThread.send({
        type: "refreshMonitors",
        fullRefresh
      })

      let timeout = setTimeout(() => {
        reject("Monitor thread timed out.")

        // Attempt to fix common issue with wmi-bridge by relying only on Win32
        // However, if user re-enables WMI, don't disable it again
        if(!settings.autoDisabledWMI && !recentlyWokeUp) {
          settings.autoDisabledWMI = true
          settings.disableWMI = true
        }
      }, 10000)

      function listen(resolve) {
        monitorsThread.once("refreshMonitors", data => {
          clearTimeout(timeout)
            resolve(data.monitors)
          })
      }
      listen(resolve)
    } catch(e) {
      reject("Monitor thread failed to send.")
    }
  })
}

let lastRefreshMonitors = 0

refreshMonitors = async (fullRefresh = false, bypassRateLimit = false) => {

  if (pausedMonitorUpdates) {
    console.log("Sorry, no updates right now!")
    return monitors
  }

  // Don't do 2+ refreshes at once
  if (isRefreshing) {
    console.log(`Already refreshing. Aborting.`)
    return monitors;
  }

  lastRefreshMonitors = Date.now()

  console.log(" ")
  console.log("\x1b[34m-------------- Refresh Monitors -------------- \x1b[0m")

  // Don't check too often for no reason
  const now = Date.now()
  if (!fullRefresh && !bypassRateLimit && now < lastEagerUpdate + 5000) {
    console.log(`Requesting update too soon. ${5000 - (now - lastEagerUpdate)}ms left.`)
    console.log("\x1b[34m---------------------------------------------- \x1b[0m")
    return monitors;
  }
  isRefreshing = true

  // Reset all known displays
  if (fullRefresh) {
    console.log("Doing full refresh.")
  }

  // Save old monitors for comparison
  let oldMonitors = Object.assign({}, monitors)
  let newMonitors

  let failed = false
  try {
    newMonitors = await refreshMonitorsJob(fullRefresh)
    if(!newMonitors) {
      failed = true;
      throw "No monitors recieved!";
    }
    lastEagerUpdate = Date.now()
  } catch (e) {
    console.log('Couldn\'t refresh monitors', e)
  }

  isRefreshing = false

  if(!failed) {
    applyOrder(newMonitors)
    applyRemaps(newMonitors)
    applyHotkeys(newMonitors)
  
    for(let id in newMonitors) {
      newMonitors[id].brightness = normalizeBrightness(newMonitors[id].brightness, true, newMonitors[id].min, newMonitors[id].max)
    }
    
    monitors = newMonitors;
  
    // Only send update if something changed
    if (JSON.stringify(newMonitors) !== JSON.stringify(oldMonitors)) {
      setTrayPercent()
      sendToAllWindows('monitors-updated', monitors)
    } else {
      console.log("===--- NO CHANGE ---===")
    }
  }

  if (shouldShowPanel) {
    shouldShowPanel = false
    setTimeout(() => toggleTray(true), 333)
  }

  console.log("\x1b[34m---------------------------------------------- \x1b[0m")
  return monitors;
}


let pausedMonitorUpdates = false
function pauseMonitorUpdates() {
  if (pausedMonitorUpdates) clearTimeout(pausedMonitorUpdates);
  pausedMonitorUpdates = setTimeout(() => pausedMonitorUpdates = false, settings.updateInterval * 2)
}




//
//
//    Brightness (and VCP) updates
//
//


let updateBrightnessTimeout = false
let updateBrightnessQueue = []
let lastBrightnessTimes = []
function updateBrightnessThrottle(id, level, useCap = true, sendUpdate = true, vcp = "brightness") {
  let idx = updateBrightnessQueue.length
  const found = updateBrightnessQueue.findIndex(item => item.id === id)
  updateBrightnessQueue[(found > -1 ? found : idx)] = {
    id,
    level,
    useCap,
    vcp
  }
  const now = Date.now()
  if (lastBrightnessTimes[id] === undefined || now >= lastBrightnessTimes[id] + settings.updateInterval) {
    lastBrightnessTimes[id] = now
    updateBrightness(id, level, useCap, vcp)
    if (sendUpdate) sendToAllWindows('monitors-updated', monitors);
    return true
  } else if (!updateBrightnessTimeout) {
    lastBrightnessTimes[id] = now
    updateBrightnessTimeout = setTimeout(() => {
      const updateBrightnessQueueCopy = updateBrightnessQueue.splice(0)
      for (let bUpdate of updateBrightnessQueueCopy) {
        if (bUpdate) {
          try {
            updateBrightness(bUpdate.id, bUpdate.level, bUpdate.useCap, bUpdate.vcp)
          } catch (e) {
            console.error(e)
          }
        }
      }
      updateBrightnessTimeout = false
      if (sendUpdate) sendToAllWindows('monitors-updated', monitors);
    }, settings.updateInterval)
  }
  return false
}




function updateBrightness(index, level, useCap = true, vcp = "brightness", clearTransition = true) {
  try {
      
    let monitor = false
    if (typeof index == "string" && index * 1 != index) {
      monitor = Object.values(monitors).find((display) => {
        return display?.id?.indexOf(index) === 0
      })
    } else {
      if (index >= Object.keys(monitors).length) {
        console.log("updateBrightness: Invalid monitor")
        return false;
      }
      monitor = monitors[index]
    }

    if(!monitor) {
      console.log(`Monitor does not exist: ${index}`)
      return false
    }

    if(settings.hideDisplays?.[monitor.key] === true) {
      return false
    }
    
    if(clearTransition && currentTransition) {
      clearInterval(currentTransition)
      currentTransition = null
    }

    const normalized = normalizeBrightness(level, false, (useCap ? monitor.min : 0), (useCap ? monitor.max : 100))

    if (monitor.type == "ddcci" && vcp === "brightness") {
      monitor.brightness = level
      monitor.brightnessRaw = normalized
      monitorsThread.send({
        type: "brightness",
        brightness: normalized * ((monitor.brightnessMax || 100) / 100),
        id: monitor.id
      })
    } else if(monitor.type == "ddcci") {
      if(Utils.vcpMap[vcp] && monitor.features[Utils.vcpMap[vcp]]) {
        monitor.features[Utils.vcpMap[vcp]][0] = level
      }
      monitorsThread.send({
        type: "vcp",
        code: vcp,
        value: level,
        monitor: monitor.hwid.join("#")
      })
    } else if (monitor.type == "wmi") {
      monitor.brightness = level
      monitor.brightnessRaw = normalized
      monitorsThread.send({
        type: "brightness",
        brightness: normalized
      })
    }

    setTrayPercent()
    updateKnownDisplays()
  } catch (e) {
    debug.error("Could not update brightness", e)
  }
}


function updateAllBrightness(brightness, mode = "offset") {

  let linkedLevelVal

  // Update internal brightness values
  for (let key in monitors) {
    const monitor = monitors[key]
    if (monitor.type !== "none") {

      let normalizedAdjust = minMax(mode == "set" ? brightness : brightness + monitor.brightness)

      // Use linked levels, if applicable
      if (settings.linkedLevelsActive) {
        // Set shared brightness value if not set
        if (linkedLevelVal) {
          normalizedAdjust = linkedLevelVal
        } else {
          linkedLevelVal = normalizedAdjust
        }
      }

      monitors[key].brightness = normalizedAdjust
    }
  }

  // Update UI
  sendToAllWindows('monitors-updated', monitors);

  // Send brightness updates
  for (let key in monitors) {
    updateBrightnessThrottle(monitors[key].id, monitors[key].brightness, true, false)
  }
}


function normalizeBrightness(brightness, normalize = false, min = 0, max = 100) {
  // normalize = true when recieving from Monitors.js
  // normalize = false when sending to Monitors.js
  let level = brightness
  if (level > 100) level = 100;
  if (level < 0) level = 0;
  if (min > 0 || max < 100) {
    let out = level
    if (!normalize) {
      // Normalize
      out = (min + ((level / 100) * (max - min)))
    } else {
      // Unnormalize
      out = ((level - min) * (100 / (max - min)))
    }
    if (out > 100) out = 100;
    if (out < 0) out = 0;

    return Math.round(out)
  } else {
    return level
  }
}

let currentTransition = null
function transitionBrightness(level, eventMonitors = [], stepSpeed = 1) {
  if (currentTransition !== null) clearInterval(currentTransition);

  // Slow down transition
  let transitionIntervalMult = 1
  switch(settings.adjustmentTimeSpeed) {
    case "slow": transitionIntervalMult = 4; break;
    case "slowest": transitionIntervalMult = 10; break;
    default: transitionIntervalMult = 1; break;
  }

  // Speed up transition
  let stepSpeedMult = 1
  switch(settings.adjustmentTimeSpeed) {
    case "fast": stepSpeedMult = 3; break;
    case "fastest": stepSpeedMult = 6; break;
    default: stepSpeedMult = 1; break;
  }

  const step = (stepSpeed * stepSpeedMult)

  currentTransition = setInterval(() => {
    let numDone = 0
    for (let key in monitors) {
      const monitor = monitors[key]

      let normalized = level * 1
      if (settings.adjustmentTimeIndividualDisplays) {
        // If using individual monitor settings
        normalized = (eventMonitors[monitor.id] >= 0 ? eventMonitors[monitor.id] : level)
      }

      if (settings.remaps) {
        for (let remapName in settings.remaps) {
          if (remapName == monitor.name) {
            normalized = normalized
          }
        }
      }
      if (monitor.brightness < normalized + (step + 1) && monitor.brightness > normalized - (step + 1)) {
        updateBrightness(monitor.id, normalized, undefined, undefined, false)
        numDone++
      } else {
        updateBrightness(monitor.id, (monitor.brightness < normalized ? monitor.brightness + step : monitor.brightness - step), undefined, undefined, false)
      }
      if (numDone === Object.keys(monitors).length) {
        clearInterval(currentTransition);
        currentTransition = null
      }
    }
  }, settings.updateInterval * transitionIntervalMult)
}

function transitionlessBrightness(level, eventMonitors = []) {
  for (let key in monitors) {
    const monitor = monitors[key]
    let normalized = level
    if (settings.adjustmentTimeIndividualDisplays) {
      // If using individual monitor settings
      normalized = (eventMonitors[monitor.id] >= 0 ? eventMonitors[monitor.id] : level)
    }
    updateBrightness(monitor.id, normalized)
  }
}

function sleepDisplays(mode = "ps") {
  try {

    setTimeout(() => {
      startIdleCheckShort()
      if(mode === "ddcci" || mode === "ps_ddcci") {
        for(let monitorID in monitors) {
          const monitor = monitors[monitorID]
          turnOffDisplayDDC(monitor.hwid.join("#"))
        }
      }
  
      if(mode === "ps" || mode === "ps_ddcci") {
        exec(`powershell.exe -NoProfile (Add-Type '[DllImport(\\"user32.dll\\")]^public static extern int SendMessage(int hWnd, int hMsg, int wParam, int lParam);' -Name a -Pas)::SendMessage(-1,0x0112,0xF170,2)`)
      }
      
    }, 333)

  } catch(e) {
    console.log(e)
  }
}

function turnOffDisplayDDC(hwid) {
  try {
    const offVal = parseInt(settings.ddcPowerOffValue)
    if(offVal === 4 || offVal === 6) {
      monitorsThread.send({
        type: "vcp",
        monitor: hwid,
        code: 0xD6,
        value: 4
      })
    }
    if(offVal === 5 || offVal === 6) {
      monitorsThread.send({
        type: "vcp",
        monitor: hwid,
        code: 0xD6,
        value: 5
      })
    }
  } catch(e) {
    console.log("turnOffDisplayDDC failed", e)
  }
}




function readInstanceName(insName) {
  return insName.replace(/&amp;/g, '&').split("\\")
}


//
//
//    IPC Events
//
//

ipcMain.on('request-colors', () => {
  sendToAllWindows('update-colors', getAccentColors())
  getThemeRegistry()
})

ipcMain.on('update-brightness', function (event, data) {
  updateBrightness(data.index, data.level)

  // If overlay is visible, keep it open
  if(hotkeyOverlayTimeout) {
    hotkeyOverlayStart()
  }
})

ipcMain.on('request-monitors', function (event, arg) {
  sendToAllWindows("monitors-updated", monitors)
  //refreshMonitors(false, true)
})

ipcMain.on('full-refresh', function (event, forceUpdate = false) {
  refreshMonitors(true).then(() => {
    if (forceUpdate) {
      sendToAllWindows('monitors-updated', monitors)
    }
  })
})

ipcMain.on('open-settings', createSettings)

ipcMain.on('log', (e, msg) => console.log(msg))

ipcMain.on('pause-updates', pauseMonitorUpdates)

ipcMain.on('open-url', (event, url) => {
  if (url === "ms-store") {
    require("electron").shell.openExternal("ms-windows-store://pdp/?productid=9PLJWWSV01LK")
  } else if (url === "privacy-policy") {
    require("electron").shell.openExternal("https://twinkletray.com/privacy-policy.html")
  } else if (url === "troubleshooting-features") {
    require("electron").shell.openExternal("https://github.com/xanderfrangos/twinkle-tray/wiki/Display-Detection-&-Support-Issues#disabling-monitor-detection-methods-available-in-v1140")
  }
})

ipcMain.on('get-update', (event, version) => {
  latestVersion.error = false
  getLatestUpdate(version)
})

ipcMain.on('panel-height', (event, height) => {
  if(panelState === "overlay") return;
  panelSize.height = height + (settings?.isWin11 ? 24 : 0)
  panelSize.width = 356 + (settings?.isWin11 ? 24 : 0)
  if (panelSize.visible && !isAnimatingPanel) {
    repositionPanel()
  }
})

ipcMain.on('panel-hidden', () => {
  sendToAllWindows("display-mode", "normal")
  panelState = "hidden"
  if (settings.killWhenIdle) mainWindow.close()
})

ipcMain.on('blur-panel', () => {
  if(mainWindow) mainWindow.blur();
})

ipcMain.on('show-acrylic', () => {
  if (settings.useAcrylic && !settings.useNativeAnimation) {
    if (lastTheme && lastTheme.ColorPrevalence) {
      tryVibrancy(mainWindow, { theme: getAccentColors().dark + (settings.useAcrylic ? "D0" : "70"), effect: (settings.useAcrylic ? "acrylic" : "blur") })
    } else {
      tryVibrancy(mainWindow, { theme: (lastTheme && nativeTheme.themeSource === "light" ? (settings.useAcrylic ? "#DBDBDBDD" : "#DBDBDB70") : (settings.useAcrylic ? "#292929DD" : "#29292970")), effect: (settings.useAcrylic ? "acrylic" : "blur") })
    }
  } else {
    tryVibrancy(mainWindow, false)
    mainWindow.setBackgroundColor("#00000000")
  }
  sendToAllWindows("set-acrylic-show")
})

ipcMain.on('apply-last-known-monitors', () => { setKnownBrightness() })

ipcMain.on('sleep-displays', () => sleepDisplays(settings.sleepAction))
ipcMain.on('sleep-display', (e, hwid) => turnOffDisplayDDC(hwid))
ipcMain.on('set-vcp', (e, values) => {
  updateBrightnessThrottle(values.monitor, values.value, false, true, values.code)
})

ipcMain.on('get-window-history', () => sendToAllWindows('window-history', windowHistory))


//
//
//    Initialize Panel
//
//

let panelState = "hidden"
let panelReady = false

function createPanel(toggleOnLoad = false) {

  console.log("Creating panel...")

  const { BrowserWindow } = require('electron')
  mainWindow = new BrowserWindow({
    width: panelSize.width,
    height: panelSize.height,
    x: 0,
    y: 0,
    minHeight: 0,
    minWidth: 0,
    backgroundColor: "#00000000",
    frame: false,
    transparent: true,
    show: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    resizable: false,
    type: "toolbar",
    title: "Twinkle Tray Flyout",
    maximizable: false,
    minimizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'panel-preload.js'),
      devTools: settings.isDev,
      enableRemoteModule: true,
      nodeIntegration: true,
      contextIsolation: false,
      plugins: false,
      backgroundThrottling: (settings.disableThrottling ? false : true),
      spellcheck: false,
      webgl: false,
      enableWebSQL: false,
      v8CacheOptions: "none",
      zoomFactor: 1.0,
      additionalArguments: ["jsVars" + Buffer.from(JSON.stringify({
        appName: app.name,
        appVersion: app.getVersion()
      })).toString('base64')],
      allowRunningInsecureContent: true,
      webSecurity: false
    }
  });

  mainWindow.loadURL(
    isDev
      ? "http://localhost:3000/index.html"
      : `file://${path.join(__dirname, "../build/index.html")}`
  );

  mainWindow.on("closed", () => { console.log("~~~~~ MAIN WINDOW CLOSED ~~~~~~"); mainWindow = null });
  mainWindow.on("minimize", () => { console.log("~~~~~ MAIN WINDOW MINIMIZED ~~~~~~") });
  mainWindow.on("restore", () => { console.log("~~~~~ MAIN WINDOW RESTORED ~~~~~~") });

  mainWindow.once('ready-to-show', () => {
    if(mainWindow) {
      mainWindow.setMenu(windowMenu)

      panelReady = true
      console.log("Panel ready!")
      createTray()

      showPanel(false)

      setTimeout(() => {
        if(!settings.useAcrylic || settings.isWin11) {
          tryVibrancy(mainWindow, false)
          mainWindow.setBackgroundColor("#00000000")
        }
      }, 100)
  
      if (toggleOnLoad) setTimeout(() => { toggleTray(false) }, 33);
    }
  })

  mainWindow.on("blur", () => {
    // Only run when not in an overlay
    if (canReposition) {
      if(!mainWindow.webContents.isDevToolsOpened()) {
        sendToAllWindows("panelBlur")
        showPanel(false)
      }
    }
  })

  mainWindow.on('move', (e) => {
    try {
      e.preventDefault()
      sendToAllWindows('panel-position', mainWindow.getPosition())
    } catch(e) { }
  })

  mainWindow.on('resize', (e) => {
    try {
      e.preventDefault()
      sendToAllWindows('panel-position', mainWindow.getPosition())
    } catch(e) { }
  })

  mainWindow.webContents.once('dom-ready', () => {
    try {
      sendToAllWindows('monitors-updated', monitors)
      // Do full refreshes shortly after startup in case Windows isn't ready.
      setTimeout(() => {
        refreshMonitors(true).then(() => {
          sendToAllWindows('monitors-updated', monitors)
        })
      }, 8000)
      
      setTimeout(sendMicaWallpaper, 1000)
      sendToAllWindows('panel-position', mainWindow.getPosition())
    } catch(e) { }
  })

}

function setAlwaysOnTop(onTop = true) {
  if(!mainWindow) return false;
  if(onTop) {
    mainWindow.setAlwaysOnTop(true, (currentProfile?.overlayType === "disabled" ? 'screen-saver' : 'modal-panel'))
  } else {
    mainWindow.setAlwaysOnTop(false)
  }
  return true
}

function restartPanel(show = false) {
  console.log("Function: restartPanel");
  if (mainWindow) {
    mainWindow.setOpacity(1)
    mainWindow.restore()
    mainWindow.show()
    mainWindow.setBounds({x:0,y:0,width:0,height:0})
  }
  setTimeout(() => {
    if (mainWindow) {
      mainWindow.close()
      mainWindow = null
    }
    createPanel(show)
  }, 1)
}

function getPrimaryDisplay() {
  let displays = screen.getAllDisplays()
  let primaryDisplay = displays.find((display) => {
    return display.bounds.x == 0 || display.bounds.y == 0
  })

  if (tray) {
    try {
      let trayBounds = tray.getBounds()
      let foundDisplay = displays.find(d => {
        return (trayBounds.x >= d.bounds.x && trayBounds.x <= d.bounds.x + d.bounds.width && trayBounds.y >= d.bounds.y && trayBounds.y <= d.bounds.y + d.bounds.height)
      })
      if (foundDisplay) primaryDisplay = foundDisplay;
    } catch (e) { }
  }
  return primaryDisplay
}



let detectedTaskbarPos = false
let detectedTaskbarHeight = false
let detectedTaskbarHide = false
let canReposition = true
function repositionPanel() {
  try {

    if (!canReposition) {
      mainWindow.setBounds({
        width: panelSize.width,
        height: panelSize.height
      })
      return false
    }
    let primaryDisplay = getPrimaryDisplay()
  
    const taskbarPosition = () => {
      let primaryDisplay = getPrimaryDisplay()
  
      const bounds = primaryDisplay.bounds
      const workArea = primaryDisplay.workArea
      let gap = 0
      let position = "BOTTOM"
      if (bounds.x < workArea.x) {
        position = "LEFT"
        gap = bounds.width - workArea.width
      } else if (bounds.y < workArea.y) {
        position = "TOP"
        gap = bounds.height - workArea.height
      } else if (bounds.width > workArea.width) {
        position = "RIGHT"
        gap = bounds.width - workArea.width
      } else {
        position = "BOTTOM"
        gap = bounds.height - workArea.height
      }
  
      // Use taskbar position from registry if auto-hide is on
      if (detectedTaskbarHide) {
        position = detectedTaskbarPos
        if (position === "TOP" || position === "BOTTOM") {
          gap = detectedTaskbarHeight
        }
      }

      if(typeof settings.overrideTaskbarPosition === "string") {
        const pos = settings.overrideTaskbarPosition.toUpperCase()
        if(pos === "BOTTOM" || pos === "TOP" || pos === "LEFT" || pos === "RIGHT") {
          position = pos
        }
      }

      if(typeof settings.overrideTaskbarGap === "number") {
        gap = settings.overrideTaskbarGap
        console.log(gap)
      }
  
      return { position, gap }
    }
  
    const taskbar = taskbarPosition()
    panelSize.taskbar = taskbar
    sendToAllWindows('taskbar', taskbar)
  
    if (mainWindow && !isAnimatingPanel) {
      if (taskbar.position == "LEFT") {
        mainWindow.setBounds({
          width: panelSize.width,
          height: panelSize.height,
          x: primaryDisplay.bounds.x + taskbar.gap,
          y: primaryDisplay.bounds.y + primaryDisplay.workArea.height - panelSize.height
        })
      } else if (taskbar.position == "TOP") {
        mainWindow.setBounds({
          width: panelSize.width,
          height: panelSize.height,
          x: primaryDisplay.bounds.x + primaryDisplay.workArea.width - panelSize.width,
          y: primaryDisplay.bounds.y + taskbar.gap
        })
      } else if (detectedTaskbarHide && taskbar.position == "BOTTOM") {
        // Edge case for auto-hide taskbar
        mainWindow.setBounds({
          width: panelSize.width,
          height: panelSize.height,
          x: primaryDisplay.bounds.x + primaryDisplay.workArea.width - panelSize.width,
          y: primaryDisplay.bounds.y + primaryDisplay.workArea.height - panelSize.height - taskbar.gap
        })
      } else {
        mainWindow.setBounds({
          width: panelSize.width,
          height: panelSize.height,
          x: primaryDisplay.bounds.x + primaryDisplay.workArea.width - panelSize.width,
          y: primaryDisplay.bounds.y + primaryDisplay.bounds.height - panelSize.height - taskbar.gap
        })
      }
      panelSize.base = mainWindow.getBounds().y
    }
    
    sendToAllWindows('panel-position', mainWindow.getPosition())
  } catch(e) {
    console.log("Couldn't reposition panel", e)
  }
}



let forcedFocusID = 0
let currentProfile
const ignoreAppList = [
  "twinkletray.exe",
  "explorer.exe",
  "electron.exe"
]
const windowHistory = []
let preProfileBrightness = {}
function startFocusTracking() {
  ActiveWindow.subscribe( async window => {
    const hwnd = WindowUtils.getForegroundWindow()
    const profile = windowMatchesProfile(window)

    if(ignoreAppList.includes(path.basename(window.path)) === false) {
      // Remove from history if exists
      const isInHistory = windowHistory.find( (w, idx) => {
        if(w.path === window.path) {
          windowHistory.splice(idx, 1)
          return true
        }
        return false
      })

      // Add current window
      windowHistory.unshift({
        app: window.application,
        path: window.path
      }) 

      // Limit history
      while(windowHistory.length > 10) windowHistory.pop();
      sendToAllWindows('window-history', windowHistory)
    }

    if(forcedFocusID > 0 && forcedFocusID !== hwnd && hwnd != getMainWindowHandle()) {
      // This is the overlay
      // We're going to force focus back to the previous window
      trySetForegroundWindow(hwnd)
    } else if(profile?.setBrightness) {
      // Set brightness, if available
    
      // First, save current brightness for later
      await updateKnownDisplays(true, true)
      preProfileBrightness = Object.assign({}, lastKnownDisplays)

      // Then apply user profile brightness
      applyProfileBrightness(profile)
    } else if(currentProfile?.setBrightness) {
      // Last profile had brightness settings
      // So we should restore the last known brightness
      applyProfile(preProfileBrightness, false)
    }
    currentProfile = profile
  })
}

function windowMatchesProfile(window) {
  let foundProfile
  if(settings.profiles?.length > 0) {
    for(const profile of settings.profiles) {
      if(window.path?.length > 0 && window.path.toLowerCase().indexOf(profile.path?.toLowerCase()) > -1) {
        foundProfile = profile
      }
    }
  }
  return foundProfile
}

function applyProfileBrightness(profile) {
  try {
    Object.values(monitors)?.forEach(monitor => {
      updateBrightness(monitor.id, profile.monitors[monitor.id], true, monitor.brightnessType)
    })
  } catch(e) {
    console.log("Error applying profile brightness", e)
  }
}

function getMainWindowHandle() {
  try {
    return mainWindow.getNativeWindowHandle().readInt32LE()
  } catch(e) {
    return 0
  }
}







/*


    Brightness panel animations


*/



let panelAnimationInterval = false
let shouldAnimatePanel = false
let isAnimatingPanel = false
let panelHeight = 0
let panelMaxHeight = 80
let panelTransitionTime = 0.35
let currentPanelTime = 0
let startPanelTime = process.hrtime.bigint()
let lastPanelTime = process.hrtime.bigint()
let primaryRefreshRate = 59.97
let primaryDPI = 1
let mainWindowHandle
let easeOutQuad = t => 1 + (--t) * t * t * t * t

// Set brightness panel state (visible or not)
function showPanel(show = true, height = 300) {

  if (show) {
    // Show panel
    if(startHideTimeout) clearTimeout(startHideTimeout); // Reset "hide" timeout
    startHideTimeout = null
    mainWindow.restore()
    mainWindowHandle = mainWindow.getNativeWindowHandle().readInt32LE(0)
    repositionPanel()
    panelHeight = height
    panelSize.visible = true

    panelSize.bounds = screen.dipToScreenRect(mainWindow, mainWindow.getBounds())
    panelSize.bounds = mainWindow.getBounds()
    primaryDPI = screen.getPrimaryDisplay().scaleFactor
    panelHeight = panelHeight * primaryDPI

    if (settings.useNativeAnimation && settings.useAcrylic && lastTheme.EnableTransparency) {
      // Acrylic + Native Animation
      if (lastTheme && lastTheme.ColorPrevalence) {
        tryVibrancy(mainWindow, { theme: getAccentColors().dark + (settings.useAcrylic ? "D0" : "70"), effect: (settings.useAcrylic ? "acrylic" : "blur") })
      } else {
        tryVibrancy(mainWindow, { theme: (lastTheme && lastTheme.SystemUsesLightTheme ? (settings.useAcrylic ? "#DBDBDBDD" : "#DBDBDB70") : (settings.useAcrylic ? "#292929DD" : "#29292970")), effect: (settings.useAcrylic ? "acrylic" : "blur") })
      }
      startPanelAnimation()
    } else {
      // No blur, or CSS Animation
      tryVibrancy(mainWindow, false)
      mainWindow.setBackgroundColor("#00000000")
      if (panelSize.taskbar.position === "TOP") {
        // Top
        setWindowPos(mainWindowHandle, -2, panelSize.bounds.x * primaryDPI, ((panelSize.base) * primaryDPI), panelSize.bounds.width * primaryDPI, panelHeight, 0x0400)
      } else {
        // Bottom, left, right
        mainWindow.show()
        mainWindow.setBounds(panelSize.bounds)
      }
    }

    setAlwaysOnTop(true)
    mainWindow.focus()

    // Resume mouse events if disabled
    pauseMouseEvents(false)
    mainWindow.setOpacity(1)
    mainWindow.show()
    sendToAllWindows('panel-position', mainWindow.getPosition())
    sendToAllWindows("playPanelAnimation")

  } else {
    // Hide panel
    setAlwaysOnTop(false)
    panelSize.visible = false
    clearInterval(panelAnimationInterval)
    panelAnimationInterval = false
    shouldAnimatePanel = false
    isAnimatingPanel = false
    sendToAllWindows("display-mode", "normal")
    panelState = "hidden"
    sendToAllWindows("closePanelAnimation")
    if (!settings.useAcrylic || !settings.useNativeAnimation) {
      tryVibrancy(mainWindow, false)
    }
    // Pause mouse events
    pauseMouseEvents(true)
    startHidePanel()
  }
}

function trySetForegroundWindow(hwnd) {
  if(!hwnd) return false;
  try {
    console.log("trySetForegroundWindow: " + hwnd)
    WindowUtils.setForegroundWindow(hwnd)
  } catch(e) {
    console.log("Couldn't focus window", e)
  }
}

let startHideTimeout
function startHidePanel() {
  if(!startHideTimeout) {
    startHideTimeout = setTimeout(() => {
      if(mainWindow) {
        mainWindow.minimize();
      }
      startHideTimeout = null      
    }, 100)

    if(mainWindow) mainWindow.setOpacity(0);
  }
}

// Begins panel opening animation
async function startPanelAnimation() {
  if (!shouldAnimatePanel) {

    // Set to animating
    shouldAnimatePanel = true
    isAnimatingPanel = true

    // Reset timing variables
    startPanelTime = process.hrtime.bigint()
    currentPanelTime = -1

    // Get refresh rate of primary display
    // This allows the animation to play no more than the refresh rate
    primaryRefreshRate = await refreshCtx.findVerticalRefreshRateForDisplayPoint(0, 0)

    // Start animation interval after a short delay
    // This avoids jank from React updating the DOM
    if (!panelAnimationInterval)
      setTimeout(() => {
        if (!panelAnimationInterval)
          panelAnimationInterval = setTimeout(doAnimationStep, 1000 / 600)
      }, 100)
  }
}

// Borrowed some of this animation logic from @djsweet
function hrtimeDeltaForFrequency(freq) {
  return BigInt(Math.ceil(1000000000 / freq));
}
let busy = false
function doAnimationStep() {

  // If animation has been requested to stop, kill it
  if (!isAnimatingPanel) {
    clearInterval(panelAnimationInterval)
    panelAnimationInterval = false
    shouldAnimatePanel = false
    return false
  }

  if (currentPanelTime === -1) {
    startPanelTime = process.hrtime.bigint()
    currentPanelTime = 0
  }
  // Limit updates to specific interval

  const now = process.hrtime.bigint()
  if (!busy && now > lastPanelTime + hrtimeDeltaForFrequency(primaryRefreshRate * (settings.useAcrylic ? 1 : 2) || 59.97)) {

    lastPanelTime = now
    currentPanelTime = Number(Number(now - startPanelTime) / 1000000000)

    // Check if at end of animation
    if (currentPanelTime >= panelTransitionTime) {
      // Stop animation
      isAnimatingPanel = false
      shouldAnimatePanel = false
      // Stop at 100%
      currentPanelTime = panelTransitionTime
      clearInterval(panelAnimationInterval)
      panelAnimationInterval = false
    }

    // LERP height and opacity
    let calculatedHeight = panelHeight - (panelMaxHeight * primaryDPI) + Math.round(easeOutQuad(currentPanelTime / panelTransitionTime) * (panelMaxHeight * primaryDPI))
    let calculatedOpacity = (Math.round(Math.min(1, currentPanelTime / (panelTransitionTime / 6)) * 100) / 100)

    // Apply panel size

    busy = true
    if (panelSize.taskbar.position === "TOP") {
      // Top
      setWindowPos(mainWindowHandle, -2, panelSize.bounds.x * primaryDPI, ((panelSize.base) * primaryDPI), panelSize.bounds.width * primaryDPI, calculatedHeight, 0x0400)
    } else {
      // Bottom, left, right
      setWindowPos(mainWindowHandle, -2, panelSize.bounds.x * primaryDPI, ((panelSize.base) * primaryDPI) + (panelHeight - calculatedHeight), panelSize.bounds.width * primaryDPI, calculatedHeight + (6 * primaryDPI * (settings.useAcrylic ? 0 : 1)), 0x0400)
    }

    // Stop opacity updates if at 1 already
    if (mainWindow.getOpacity() < 1)
      mainWindow.setOpacity(calculatedOpacity)
    busy = false
  }

  if (isAnimatingPanel) {
    panelAnimationInterval = setTimeout(doAnimationStep, 1000 / (primaryRefreshRate * (settings.useAcrylic ? 1 : 2) || 59.97))
  } else {
    repositionPanel()
  }
}









app.on("ready", async () => {
  await getAllLanguages()
  await getThemeRegistry()
  readSettings()
  getLocalization()

  refreshMonitors(true, true).then(() => {
    if (settings.brightnessAtStartup) setKnownBrightness();
    if (settings.checkTimeAtStartup) {
      lastTimeEvent = false;
      setTimeout(() => handleBackgroundUpdate(true), 3500)
    }
    restartBackgroundUpdate()
    showIntro()
    createPanel()
  })

  setTimeout(addEventListeners, 2000)
})

app.on("window-all-closed", () => {
  //app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) {
    //createPanel(true);
  }
});

app.on('quit', () => {
  try {
    tray.destroy()
  } catch (e) {

  }
})



//
//
//    Tray
//
//

function createTray() {
  if (tray != null) return false;

  const { Tray } = require('electron')
  tray = new Tray(getTrayIconPath())
  tray.setToolTip('Twinkle Tray' + (isDev ? " (Dev)" : ""))
  setTrayMenu()
  tray.on("click", async () => toggleTray(true))

  let lastMouseMove = Date.now()
  tray.on('mouse-move', async () => {
    const now = Date.now()
    if(lastMouseMove + 500 > now) return false;
    lastMouseMove = now
    bounds = tray.getBounds()
    bounds = screen.dipToScreenRect(null, bounds)
    tryEagerUpdate(false)
    sendToAllWindows('panel-unsleep')

    if(settings.scrollShortcut) {
      // Start tracking cursor to determine when it leaves the tray
      if(mouseEvents && mouseEvents.getPaused()) {
        pauseMouseEvents(false)
      }
      willPauseMouseEvents()
    }
  })

}

function setTrayMenu() {
  if (tray === null) return false;

  const contextMenu = Menu.buildFromTemplate([
    getTimeAdjustmentsMenuItem(),
    getDetectIdleMenuItem(),
    getPausableSeparatorMenuItem(),
    { label: T.t("GENERIC_REFRESH_DISPLAYS"), type: 'normal', click: () => refreshMonitors(true, true) },
    { label: T.t("GENERIC_SETTINGS"), type: 'normal', click: createSettings },
    { type: 'separator' },
    getDebugTrayMenuItems(),
    { label: T.t("GENERIC_QUIT"), type: 'normal', click: quitApp }
  ])
  tray.setContextMenu(contextMenu)
}

function getPausableSeparatorMenuItem() {
  if(settings.detectIdleTimeEnabled || settings.adjustmentTimes.length > 0) {
    return { type: 'separator' }
  }
  return { label: "", visible: false }
}

function getTimeAdjustmentsMenuItem() {
  if(settings.adjustmentTimes?.length) {
    return { label: T.t("GENERIC_PAUSE_TOD"), type: 'checkbox', click: (e) => tempSettings.pauseTimeAdjustments = e.checked }
  }
  return { label: "", visible: false }
}

function getDetectIdleMenuItem() {
  if(settings.detectIdleTimeEnabled) {
    return { label: T.t("GENERIC_PAUSE_IDLE"), type: 'checkbox', click: (e) => tempSettings.pauseIdleDetection = e.checked }
  }
  return { label: "", visible: false }
}

function getDebugTrayMenuItems() {
  return { label: "DEBUG", visible: (settings.isDev ? true : false), submenu: [
    { label: "RESTART PANEL", type: 'normal', click: () => restartPanel() },
    { label: "MINIMIZE PANEL", type: 'normal', click: () => mainWindow?.minimize() },
    { label: "HIDE PANEL", type: 'normal', click: () => showPanel(false) },
    { label: "OPACITY 0", type: 'normal', click: () => mainWindow?.setOpacity(0) },
    { label: "OPACITY 1", type: 'normal', click: () => mainWindow?.setOpacity(1) },
    { label: "DO CURRENT TOD", type: 'normal', click: () => applyCurrentAdjustmentEvent(true) },
    { label: "REMOVE ACRYLIC", type: 'normal', click: () => tryVibrancy(mainWindow, false) },
    { label: "PAUSE MOUSE", type: 'normal', click: () => pauseMouseEvents(true) },
    { label: "LAST ACTIVE WIN", type: 'normal', click: () => trySetForegroundWindow(forcedFocusID) }
  ] }
}

function setTrayPercent() {
  try {
    if (tray) {
      let averagePerc = 0
      let i = 0
      for (let key in monitors) {
        if (monitors[key].type === "ddcci" || monitors[key].type === "wmi") {
          i++
          averagePerc += monitors[key].brightness
        }
      }
      if (i > 0) {
        averagePerc = Math.floor(averagePerc / i)
        tray.setToolTip('Twinkle Tray' + (isDev ? " (Dev)" : "") + ' (' + averagePerc + '%)')
      }
    }
  } catch (e) {
    console.log(e)
  }
}

let lastEagerUpdate = 0
function tryEagerUpdate(forceRefresh = true) {
  const now = Date.now()
  if (now > lastEagerUpdate + 5000) {
    lastEagerUpdate = now
    refreshMonitors(forceRefresh, true)
  }
}

function quitApp() {
  app.quit()
}

const toggleTray = async (doRefresh = true, isOverlay = false) => {

  if (mainWindow == null) {
    createPanel(true)
    return false
  }

  if (isRefreshing) {
    //shouldShowPanel = true
    //return false
  }

  if (doRefresh && !isOverlay) {
    tryEagerUpdate(false)
    getThemeRegistry()
    getSettings()

    // Send accent
    sendToAllWindows('update-colors', getAccentColors())
    if (latestVersion) sendToAllWindows('latest-version', latestVersion);
  }

  if (mainWindow) {
    mainWindow.setBackgroundColor("#00000000")
    if (!isOverlay) {

      // Check if overlay is currently open and deal with that
      if (!canReposition) {
        showPanel(false)
        hotkeyOverlayHide()
        setTimeout(() => {
          sendToAllWindows("display-mode", "normal")
          //toggleTray(doRefresh, isOverlay)
        }, 300)
        return false
      }
      sendMicaWallpaper()
      sendToAllWindows("display-mode", "normal")
      showPanel(true, panelSize.height)
      panelState = "visible"
      mainWindow.focus()
    } else {
      sendToAllWindows("display-mode", "overlay")
      panelState = "overlay"
    }
    sendToAllWindows('request-height')
    mainWindow.webContents.send("tray-clicked")
    mainWindow.setSkipTaskbar(false)
    mainWindow.setSkipTaskbar(true)
  }
}





//
//
//    Intro Window
//
//

let introWindow
function showIntro() {

  // Check if user has already seen the intro
  if (settings.userClosedIntro) {
    return false;
  }

  if (introWindow != null) {
    // Don't make window if already open
    introWindow.focus()
    return false;
  }

  const { BrowserWindow } = require('electron')
  introWindow = new BrowserWindow({
    width: 500,
    height: 650,
    show: false,
    maximizable: false,
    resizable: false,
    minimizable: false,
    frame: false,
    transparent: true,
    icon: './src/assets/logo.ico',
    title: "Twinkle Tray",
    webPreferences: {
      preload: path.join(__dirname, 'intro-preload.js'),
      devTools: settings.isDev,
      enableRemoteModule: true,
      nodeIntegration: true,
      zoomFactor: 1.0,
      contextIsolation: false
    }
  });

  introWindow.loadURL(
    isDev
      ? "http://localhost:3000/intro.html"
      : `file://${path.join(__dirname, "../build/intro.html")}`
  );

  introWindow.on("closed", () => (introWindow = null));

  introWindow.once('ready-to-show', () => {
    introWindow.setMenu(windowMenu)
    introWindow.show()
    if (lastTheme) sendToAllWindows('theme-settings', lastTheme)
  })

}

ipcMain.on('close-intro', (event, newSettings) => {
  if (introWindow) {
    introWindow.close()
    writeSettings({ userClosedIntro: true })
  }
})






//
//
//    Settings Window
//
//

let settingsWindow
function createSettings() {

  if (settingsWindow != null) {
    // Don't make window if already open
    settingsWindow.focus()
    return false;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  const { BrowserWindow } = require('electron')
  settingsWindow = new BrowserWindow({
    width: (width >= 1200 ? 1024 : 600),
    height: (height >= 768 ? 720 : 500),
    minHeight: 450,
    minWidth: 400,
    show: false,
    maximizable: true,
    resizable: true,
    minimizable: true,
    backgroundColor: "#00000000",
    frame: false,
    icon: './src/assets/logo.ico',
    title: "Twinkle Tray Settings",
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      devTools: settings.isDev,
      enableRemoteModule: true,
      nodeIntegration: true,
      contextIsolation: false,
      allowRunningInsecureContent: true,
      webSecurity: false,
      zoomFactor: 1.0,
      additionalArguments: ["jsVars" + Buffer.from(JSON.stringify({
        appName: app.name,
        appVersion: app.getVersion(),
        settings,
        lastTheme
      })).toString('base64')]
    }
  });

  
  require("@electron/remote/main").enable(settingsWindow.webContents);

  settingsWindow.loadURL(
    isDev
      ? "http://localhost:3000/settings.html"
      : `file://${path.join(__dirname, "../build/settings.html")}`
  );

  settingsWindow.on("closed", () => (settingsWindow = null));

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.setMenu(windowMenu)

    // Show after a very short delay to avoid visual bugs
    setTimeout(() => {
      sendMicaWallpaper()
      settingsWindow.show()
    }, 100)

    // Prevent links from opening in Electron
    settingsWindow.webContents.on('will-navigate', (e, url) => {
      if (url.indexOf("http://localhost:3000") !== 0 || url.indexOf("file://") !== 0) return false;
      e.preventDefault()
      require('electron').shell.openExternal(url)
    })
  })

  // Sort Time of Day Adjustments
  // We're doing it here as it's least obtrusive to the UI. Refreshing when re-opening the window.
  if(settings.adjustmentTimes?.length) {
    settings.adjustmentTimes.sort((a, b) => {
      const aVal = Utils.parseTime(a.time)
      const bVal = Utils.parseTime(b.time)
      return aVal - bVal
    })
  }

}



//
//
//    App Updates
//
//



let latestVersion = false
let lastCheck = false
checkForUpdates = async (force = false) => {
  if (!force) {
    if (!settings.checkForUpdates) return false;
    if (lastCheck && lastCheck == new Date().getDate()) return false;
  }
  if(isPortable || isAppX) return false;
  lastCheck = new Date().getDate()
  try {
    const fetch = require('node-fetch');
    if (isAppX === false) {
      console.log("Checking for updates...")
      fetch("https://api.github.com/repos/xanderfrangos/twinkle-tray/releases").then((response) => {
        response.json().then((releases) => {
          let foundVersion = false
          for (let release of releases) {
            if (!(settings.branch === "master" && release.prerelease === true)) {
              foundVersion = true
              latestVersion = {
                releaseURL: (release.html_url),
                version: release.tag_name,
                downloadURL: release.assets[0]["browser_download_url"],
                filesize: release.assets[0]["size"],
                changelog: release.body,
                show: false,
                error: false
              }
              console.log("Found version: " + latestVersion.version)
              break
            }
          }

          if (foundVersion && "v" + app.getVersion() != latestVersion.version && (settings.dismissedUpdate != latestVersion.version || force)) {
            if (!force) latestVersion.show = true
            console.log("Sending new version to windows.")
            sendToAllWindows('latest-version', latestVersion)
          }

        })
      });
    }
  } catch (e) {
    console.log(e)
  }
  Utils.unloadModule("node-fetch")
}


getLatestUpdate = async (version) => {
  try {
    console.log("Downloading update from: " + version.downloadURL)
    const fs = require('fs');
    const fetch = require('node-fetch');

    latestVersion.downloading = true
    sendToAllWindows('latest-version', latestVersion)

    // Remove old update
    if (fs.existsSync(updatePath)) {
      try {
        fs.unlinkSync(updatePath)
      } catch (e) {
        console.log("Couldn't delete old update file")
      }
    }

    const update = await fetch(version.downloadURL)
    await new Promise((resolve, reject) => {
      console.log("Downloading...!")
      const dest = fs.createWriteStream(updatePath);
      //update.body.pipe(dest);
      update.body.on('error', (err) => {
        reject(err)
      })

      dest.on('close', () => {
        setTimeout(() => {
          runUpdate(version.filesize)
        }, 1250)
        resolve(true)
      })
      update.body.on('finish', function () {
        console.log("Saved! Running...")
      });

      let size = 0
      let lastSizeUpdate = 0
      update.body.on('data', (chunk) => {
        size += chunk.length
        dest.write(chunk, (err) => {
          if (size >= version.filesize) {
            dest.close()
          }
        })
        if (size >= lastSizeUpdate + (version.filesize * 0.01) || lastSizeUpdate === 0 || size === version.filesize) {
          lastSizeUpdate = size
          sendToAllWindows('updateProgress', Math.floor((size / version.filesize) * 100))
          console.log(`Downloaded ${size / 1000}KB. [${Math.floor((size / version.filesize) * 100)}%]`)
        }
      })

    })

  } catch (e) {
    console.log("Couldn't download update!", e)
    latestVersion.show = true
    latestVersion.downloading = false
    sendToAllWindows('latest-version', latestVersion)
  }
  Utils.unloadModule("node-fetch")
}

function runUpdate(expectedSize = false) {
  try {

    if (!fs.existsSync(updatePath)) {
      throw ("Update file doesn't exist!")
    }
    console.log("Expected size: " + expectedSize)
    const fileSize = fs.statSync(updatePath).size
    if (expectedSize && fileSize != expectedSize) {
      try {
        // Wrong file size, will try to delete
        fs.unlinkSync(updatePath)
      } catch (e) {
        throw ("Couldn't delete update file. " + e)
      }
      console.log("Atempted to delete update file")
      throw (`Update is wrong file size! Expected: ${expectedSize}. Got: ${fileSize}`)
    }

    /*
    // For testing
    latestVersion.show = true
    latestVersion.error = true
    sendToAllWindows('latest-version', latestVersion)
    return false;
    */

    const { spawn } = require('child_process');
    let process = spawn(updatePath, {
      detached: true,
      stdio: 'ignore'
    });

    // IDK, try again?
    process.once("error", () => {
      setTimeout(() => {
        process = spawn(updatePath, {
          detached: true,
          stdio: 'ignore'
        });
      }, 1000)
    })

    process.unref()
    app.quit()
  } catch (e) {
    console.log(e)
    latestVersion.show = true
    latestVersion.error = true
    sendToAllWindows('latest-version', latestVersion)
  }

}

ipcMain.on('check-for-updates', () => {
  latestVersion.error = false
  sendToAllWindows('latest-version', latestVersion)
  checkForUpdates(true)
})

ipcMain.on('ignore-update', (event, dismissedUpdate) => {
  writeSettings({ dismissedUpdate })
  latestVersion.show = false
  sendToAllWindows('latest-version', latestVersion)
})

ipcMain.on('clear-update', (event, dismissedUpdate) => {
  latestVersion.show = false
  sendToAllWindows('latest-version', latestVersion)
})



//
//
//    System event listeners
//
//

let backgroundInterval = null
function addEventListeners() {
  systemPreferences.on('accent-color-changed', handleAccentChange)
  systemPreferences.on('color-changed', handleAccentChange)
  nativeTheme.on('updated', handleAccentChange)

  addDisplayChangeListener(handleMonitorChange)

  enableMouseEvents()

  // Disable mouse events at startup
  pauseMouseEvents(true)

  startFocusTracking()
}

let handleAccentChangeTimeout = false
function handleAccentChange() {
  if(handleAccentChangeTimeout) clearTimeout(handleAccentChangeTimeout);
  handleAccentChangeTimeout = setTimeout(async () => {
    console.log("Event: handleAccentChange");
    sendToAllWindows('update-colors', getAccentColors())
    await getThemeRegistry()
    setTimeout(sendMicaWallpaper, 100)
    try {
      tray.setImage(getTrayIconPath())
    } catch (e) {
      debug.log("Couldn't update tray icon!", e)
    }
    handleAccentChangeTimeout = false
  }, 2000)
}

let skipFirstMonChange = false
let handleChangeTimeout0
let handleChangeTimeout1
let handleChangeTimeout2
function handleMonitorChange(e, d) {
  console.log("Event: handleMonitorChange");

  // Skip event that happens at startup
  if (!skipFirstMonChange) {
    skipFirstMonChange = true
    return false
  }

  console.log("Hardware change detected.")

  // Defer actions for a moment just in case of repeat events
  if (handleChangeTimeout0) {
    clearTimeout(handleChangeTimeout0)
  }
  handleChangeTimeout0 = setTimeout(() => {
    if(!settings.disableAutoApply) setKnownBrightness();
    handleChangeTimeout0 = false
  }, 150)
  if (handleChangeTimeout1) {
    clearTimeout(handleChangeTimeout1)
  }
  handleChangeTimeout1 = setTimeout(() => {
    if(!settings.disableAutoApply) setKnownBrightness();
    handleChangeTimeout1 = false
  }, 750)
  if (handleChangeTimeout2) {
    clearTimeout(handleChangeTimeout2)
  }
  handleChangeTimeout2 = setTimeout(() => {

    // Reset all known displays
    if(!settings.disableAutoRefresh) refreshMonitors(true, true).then(() => {
      if(!settings.disableAutoApply) setKnownBrightness();
      handleBackgroundUpdate(true) // Apply Time Of Day Adjustments

      // If displays not shown, refresh mainWindow
      //restartPanel(panelSize.visible)
    })

    handleChangeTimeout2 = false
  }, 5000)

}

// Handle resume from sleep/hibernation
powerMonitor.on("resume", () => {
  console.log("Resuming......")
  if(!settings.disableAutoApply) setKnownBrightness();
  setTimeout(
    () => {
      if(!settings.disableAutoRefresh) refreshMonitors(true, true).then(() => {
        if(!settings.disableAutoApply) setKnownBrightness();
        //restartPanel()

        // Check if time adjustments should apply
        applyCurrentAdjustmentEvent(true, false)
      })
    },
    3000 // Give Windows a few seconds to... you know... wake up.
  )
  if(!settings.disableAutoRefresh) setTimeout(() => {
    refreshMonitors(true)
  },
  10000 // Additional full refresh
  )


})


// Monitor system power/lock state to avoid accidentally tripping the WMI auto-disabler
let recentlyWokeUp = false
powerMonitor.on("suspend", () => {  console.log("Event: suspend"); recentlyWokeUp = true })
powerMonitor.on("lock-screen", () => {  console.log("Event: lock-screen"); recentlyWokeUp = true })
powerMonitor.on("unlock-screen", () => {
  console.log("Event: unlock-screen");
  recentlyWokeUp = true
  if(!settings.disableAutoRefresh) refreshMonitors(true);
    setTimeout(() => {
      recentlyWokeUp = false
    }, 
    15000
    )
})
powerMonitor.on("resume", () => {
  console.log("Event: resume");
    recentlyWokeUp = true
    setTimeout(() => {
      recentlyWokeUp = false
    }, 
    15000
    )
})


let restartBackgroundUpdateThrottle = false
function restartBackgroundUpdate() {
  if (!restartBackgroundUpdateThrottle) {
    restartBackgroundUpdateThrottle = setTimeout(() => {
      restartBackgroundUpdateThrottle = false
      clearInterval(backgroundInterval)
      backgroundInterval = setInterval(() => handleBackgroundUpdate(), (isDev ? 8000 : 60000 * 1))
      handleBackgroundUpdate()
    }, 3000)
  } else {
    clearTimeout(restartBackgroundUpdateThrottle)
    restartBackgroundUpdateThrottle = false
    restartBackgroundUpdate()
  }
}


// Idle detection
let isUserIdle = false
let userIdleInterval = false // Check if idle
let userCheckingForActiveInterval = false // Check if came back
let userIdleDimmed = false

let idleMonitor = setInterval(idleCheckLong, 5000)
let notIdleMonitor
let lastIdleTime = 0

let preIdleMonitors = {}

function getIdleSettingValue() {
  const detectIdleTime = (parseInt(settings.detectIdleTimeSeconds) + (settings.detectIdleTimeMinutes * 60))
  return detectIdleTime
}

function idleCheckLong() {
  if(tempSettings.pauseIdleDetection) return false;
  //if(powerMonitor.onBatteryPower) return false;
  const idleTime = powerMonitor.getSystemIdleTime()
  lastIdleTime = idleTime
  if(idleTime >= (settings.detectIdleTimeEnabled ? getIdleSettingValue() : 180) && !notIdleMonitor) {
    startIdleCheckShort()
  }
}

async function startIdleCheckShort() {
  isUserIdle = true
  await updateKnownDisplays(true, true)
  preIdleMonitors = Object.assign({}, lastKnownDisplays)
  console.log(`\x1b[36mStarted short idle monitor.\x1b[0m`)
  if(notIdleMonitor) clearInterval(notIdleMonitor);
  notIdleMonitor = setInterval(idleCheckShort, 1000)
}

function idleCheckShort() {
  try {
    const idleTime = powerMonitor.getSystemIdleTime()

    if (!userIdleDimmed && settings.detectIdleTimeEnabled && idleTime >= getIdleSettingValue()) {
      console.log(`\x1b[36mUser idle. Dimming displays.\x1b[0m`)
      userIdleDimmed = true
      try {
        Object.values(monitors)?.forEach((monitor) => {
          updateBrightness(monitor.id, 0, true, monitor.brightnessType)
        })
      } catch(e) {
        console.log(`Error dimming displays`, e)
      }
    }
  
    if(isUserIdle && (idleTime < lastIdleTime || idleTime < getIdleSettingValue())) {
      // Wake up
      console.log(`\x1b[36mUser no longer idle after ${lastIdleTime} seconds.\x1b[0m`)
      clearInterval(notIdleMonitor)
      notIdleMonitor = false

      // Different behavior depending on if idle dimming is on
      if(settings.detectIdleTimeEnabled) {
        // Always restore when dimmed
        setKnownBrightness(false)
      } else {
        // Not dimmed, try checking ToD first. sKB as backup.
        const foundEvent = applyCurrentAdjustmentEvent(true, true)
        if(!foundEvent && !settings.disableAutoApply) setKnownBrightness(false);
      }
      
      // Wait a little longer, re-apply known brightness in case monitors take a moment, and finish up
      setTimeout(() => {
        isUserIdle = false
        userIdleDimmed = false
        lastIdleTime = 1

        // Similar logic to above
        if(settings.detectIdleTimeEnabled) {
          // Always restore when dimmed, then check ToD
          setKnownBrightness(false)
          applyCurrentAdjustmentEvent(true, false)
        } else {
          // Not dimmed, try checking ToD first. sKB as backup.
          const foundEvent = applyCurrentAdjustmentEvent(true, true)
          if(!foundEvent && !settings.disableAutoApply) setKnownBrightness(false)
        }
      }, 3000)
  
    }
    lastIdleTime = idleTime
  } catch(e) {
    console.log('Error in idleCheckShort', e)
  }
}


// Get the currently applicable Time of Day Adjustment
function getCurrentAdjustmentEvent() {

  const date = new Date()
  const nowValue = (date.getHours() * 60) + (date.getMinutes() * 1)

  // Find most recent event
  let foundEvent = false
  try {
    for (let event of settings.adjustmentTimes) {
      const eventValue = Utils.parseTime(event.time)

      // Check if event is not later than current time, last event time, or last found time
      if (eventValue <= nowValue) {
        // Check if found event is greater than last found event
        if (foundEvent === false || foundEvent.value <= eventValue) {
          foundEvent = Object.assign({}, event)
          foundEvent.monitors = Object.assign({}, event.monitors)
          foundEvent.value = eventValue
        }
      }
    }
  } catch (e) {
    console.log("Error getting adjustment times!", e)
  }

  return foundEvent
}

function getNextAdjustmentEvent() {
  const currentEvent = getCurrentAdjustmentEvent()
  if(!currentEvent) return false

  let earliestEvent = false
  let closestEvent = false

  try {
    for (let event of settings.adjustmentTimes) {
      const eventValue = Utils.parseTime(event.time)

      // Check if event is later than current time, and less than the last found event
      if (eventValue > currentEvent.value && (!closestEvent || eventValue < closestEvent.value)) {
        closestEvent = Object.assign({}, event)
        closestEvent.monitors = Object.assign({}, event.monitors)
        closestEvent.value = eventValue
      }

      // Check if event is the earliest
      if (!earliestEvent || eventValue < earliestEvent.value) {
        earliestEvent = Object.assign({}, event)
        earliestEvent.monitors = Object.assign({}, event.monitors)
        earliestEvent.value = eventValue
      }
    }
  } catch (e) {
    console.log("Error getting adjustment times!", e)
  }

  // Return closest event or earliest event
  return (closestEvent ? closestEvent : earliestEvent)
}


function getCurrentAdjustmentEventLERP() {
  try {
    const current = getCurrentAdjustmentEvent()
    const next = getNextAdjustmentEvent()
  
    if(!current || !next) return false;
  
    const date = new Date()
    const nowValue = (date.getHours() * 60) + (date.getMinutes() * 1)
  
    if(current.value > next.value) {
      next.value += 1440 // Add 24hr if next event is tomorrow
    }
  
    // Calculate 0-1 percentage of progress
    const percent = (next.value - nowValue) / (next.value - current.value)
  
    // Generate result depending on if displays are linked
    if(settings.adjustmentTimeIndividualDisplays) {
      const keys = Object.keys(next.monitors)
      const monitors = Object.assign(current.monitors)
      keys.forEach(key => {
        if(monitors[key] > -1) {
          monitors[key] = Math.round(Utils.lerp(current.monitors[key], next.monitors[key], percent))
        }
      })
      return monitors
    } else {
      return Math.round(Utils.lerp(current.brightness, next.brightness, percent))
    }
  } catch(e) {
    console.log("Error generating Adjustment Time LERP", e)
    return false
  }
}

// If applicable, apply the current Time of Day Adjustment
function applyCurrentAdjustmentEvent(force = false, instant = true) {
  try {
    if (tempSettings.pauseTimeAdjustments || currentProfile?.setBrightness) return false;
    if (settings.adjustmentTimes.length === 0 || userIdleDimmed) return false;

    const date = new Date()

    // Reset on new day
    if (force || settings.adjustmentTimeAnimate || (lastTimeEvent && lastTimeEvent.day != date.getDate())) {
      console.log("New day (or forced)... resetting lastTimeEvent")
      lastTimeEvent = false
    }

    // Find most recent event
    const foundEvent = getCurrentAdjustmentEvent()
    if (foundEvent) {
      if (lastTimeEvent == false || lastTimeEvent.value < foundEvent.value) {

        if(settings.adjustmentTimeAnimate) {
          // If LERPing, override foundEvent with interpolated value
          lerp = getCurrentAdjustmentEventLERP()
          if(typeof lerp === "number") {
            foundEvent.brightness = lerp
          } else if(typeof lerp === "object") {
            foundEvent.monitors = lerp
          }
        }

        console.log("Adjusting brightness automatically", foundEvent)
        lastTimeEvent = Object.assign({}, foundEvent)
        lastTimeEvent.day = new Date().getDate()

        refreshMonitors().then(() => {
          if (instant || settings.adjustmentTimeSpeed === "instant") {
            transitionlessBrightness(foundEvent.brightness, (foundEvent.monitors ? foundEvent.monitors : {}))
          } else {
            transitionBrightness(foundEvent.brightness, (foundEvent.monitors ? foundEvent.monitors : {}))
          }
        })
        return foundEvent
      }
    }
  } catch (e) {
    console.log("Error applying current Time of Day Adjustment", e)
  }

}


let lastTimeEvent = {
  hour: new Date().getHours(),
  minute: new Date().getMinutes(),
  day: new Date().getDate()
}
function handleBackgroundUpdate(force = false) {
  console.log("Event: handleBackgroundUpdate");

  try {
    // Wallpaper updates
    sendMicaWallpaper()

    // Time of Day Adjustments
    if (settings.adjustmentTimes.length > 0 && !userIdleDimmed) {
      applyCurrentAdjustmentEvent(force, false)
    }
  } catch (e) {
    console.error(e)
  }

  if(!force) checkForUpdates(); // Ignore when forced update, since it should just be about fixing brightness.

  // GC
  setTimeout(() => {
    try { global.gc() } catch(e) {}
  }, 1000)
}

/*

Handle input from second process command line. One monitor argument and one brightness argument is required. Multiple arguments will override each other.
Full example: TwinkleTray.exe --MonitorNum=1 --Offset=-30

Supported args:

--MonitorNum
Select monitor by number. Starts at 1.
Example: --MonitorNum=2

--MonitorID
Select monitor by internal ID. Partial or whole matches accepted.
Example: --MonitorID="UID2353"

--All
Flag to update all monitors.
Example: --All

--Set
Set brightness percentage.
Example: --Set=95

--Offset
Adjust brightness percentage.
Example: --Offset=-20

--VCP
Send a specific DDC/CI VCP code and value instead of brightness. The first part is the VCP code (decimal or hexadecimal), and the second is the value.
Example: --VCP="0xD6:5"

--Overlay
Flag to show brightness levels in the overlay
Example: --Overlay

--Panel
Flag to show brightness levels in the panel
Example: --Panel

*/
function handleCommandLine(event, argv, directory, additionalData) {

  let display
  let type
  let brightness
  let usetime
  let ddcciVCP
  let commandLine = []

  try {
    // Extract flags
    additionalData.forEach((flag) => {
      if(flag.indexOf('--') == 0) {
        commandLine.push(flag.toLowerCase())
      }
    })

    if (commandLine.length > 0) {

      commandLine.forEach(arg => {

        // List all displays
        if (arg.indexOf("--list=") === 0) {
          
        }

        // Get display by index
        if (arg.indexOf("--monitornum=") === 0) {
          display = Object.values(monitors)[(arg.substring(13) * 1) - 1]
        }

        // Get display by ID (partial or whole)
        if (arg.indexOf("--monitorid=") === 0) {
          const monID = Object.keys(monitors).find(id => {
            return id.toLowerCase().indexOf(arg.substring(12)) >= 0
          })
          display = monitors[monID]
        }

        // Run on all displays
        if (arg.indexOf("--all") === 0 && arg.length === 5) {
          display = "all"
        }

        // Use absolute brightness
        if (arg.indexOf("--set=") === 0) {
          brightness = (arg.substring(6) * 1)
          type = "set"
        }

        // Use relative brightness
        if (arg.indexOf("--offset=") === 0) {
          brightness = (arg.substring(9) * 1)
          type = "offset"
        }

        // Use time adjustments
        if (arg.indexOf("--usetime") === 0) {
          usetime = true
        }

        // DDC/CI command
        if (arg.indexOf("--vcp=") === 0 && arg.indexOf(":")) {
            try {
              const values = arg.substring(6).replace('"').replace('"').split(":")
              ddcciVCP = {
                code: parseInt(values[0]),
                value: parseInt(values[1])
              }
            } catch(e) {
              console.log("Couldn't parse VCP code!")
            }
            
        }

        // Show overlay
        if (arg.indexOf("--overlay") === 0 && panelState !== "visible") {
          hotkeyOverlayStart()
        }

        // Show panel
        if (arg.indexOf("--panel") === 0 && panelState !== "visible") {
          toggleTray(true)
        }

      })

      // If value input, update brightness
      if (display && type && brightness !== undefined) {

        if (display === "all") {
          console.log(`Setting brightness via command line: All @ ${brightness}%`);
          updateAllBrightness(brightness, type)
        } else {
          const newBrightness = minMax(type === "set" ? brightness : display.brightness + brightness)
          console.log(`Setting brightness via command line: Display #${display.num} (${display.name}) @ ${newBrightness}%`);
          updateBrightnessThrottle(display.id, newBrightness, true)
        }

      }

      if(display && ddcciVCP) {
        if(display === "all") {
          Object.values(monitors).forEach(monitor => {
            monitorsThread.send({
              type: "vcp",
              code: ddcciVCP.code,
              value: ddcciVCP.value,
              monitor: monitor.hwid.join("#")
            })
          })
        } else {
          monitorsThread.send({
            type: "vcp",
            code: ddcciVCP.code,
            value: ddcciVCP.value,
            monitor: display.hwid.join("#")
          })
        }
      }

      if(usetime) {
        applyCurrentAdjustmentEvent(true, false)
      }

    }

  } catch (e) {
    console.log(e)
  }

}




// Mica features
let currentWallpaper = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs%3D";
let currentWallpaperTime = false;
let currentWallpaperFileSize = 0;
let currentScreenSize = {width: 1280, height: 720}
let sharpBusy = false
let lastSharpTime = Date.now()
const homeDir = require("os").homedir()
const micaWallpaperPath = path.join(configFilesDir, `\\mica${(isDev ? "-dev" : "")}.jpg`)
async function getWallpaper() {
  if(sharpBusy) return { path: currentWallpaper, size: currentScreenSize };
  try {  
    const wallPath = path.join(homeDir, "AppData", "Roaming", "Microsoft", "Windows", "Themes", "TranscodedWallpaper");
    const file = fs.statSync(wallPath)
    const newTime = file.mtime.getTime()
    const newSize = file.size

    // If time on file changed, render new wallpaper
    if(file?.mtime && (newTime !== currentWallpaperTime || newSize !== currentWallpaperFileSize)) {
      sharpBusy = true
      currentScreenSize = screen.getPrimaryDisplay().workAreaSize
      const sharp = require('sharp')
      sharp.cache(false)
      const wallpaperImage = sharp(wallPath)
      await sharp({
        create: {
          width: currentScreenSize.width * 0.5,
          height: currentScreenSize.height * 0.5,
          channels: 4,
          background: "#202020FF"
        }
      }).composite([{ input: await wallpaperImage.ensureAlpha(1).resize(currentScreenSize.width * 0.5, currentScreenSize.height * 0.5, { fit: "fill" }).blur(30).toBuffer(), blend: "source" }]).flatten().jpeg({ quality: 95 }).toFile(micaWallpaperPath)
      currentWallpaper = "file://" + micaWallpaperPath + "?" + Date.now()
      currentWallpaperTime = newTime
      currentWallpaperFileSize = newSize;
      lastSharpTime = Date.now()
    }
    
    Utils.unloadModule("sharp")
    sharpBusy = false
    return { path: currentWallpaper, size: currentScreenSize }
  } catch(e) {
    console.log("Wallpaper file not found or unavailable.", e)
    sharpBusy = false
    return { path: currentWallpaper, size: currentScreenSize }
  }
}

async function sendMicaWallpaper() {
  // Skip if Win10 or Mica disabled
  if(!settings?.useAcrylic || !settings?.isWin11 || !mainWindow) return false;
  sendToAllWindows("mica-wallpaper", await getWallpaper())
}

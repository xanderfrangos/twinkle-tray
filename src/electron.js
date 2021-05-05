const path = require('path');
const fs = require('fs')
const { nativeTheme, systemPreferences, Menu, Tray, ipcMain, app, screen, globalShortcut, powerMonitor } = require('electron')
const Utils = require("./Utils")

// Handle multiple instances before continuing
const singleInstanceLock = app.requestSingleInstanceLock()
if (!singleInstanceLock) {
  try { Utils.handleProcessedArgs(Utils.processArgs(process.argv)) } catch (e) { }
  app.exit()
  return false;
} else {
  console.log("Starting Twinkle Tray...")
  app.on('second-instance', handleCommandLine)
}

const { fork } = require('child_process');
const { BrowserWindow } = require('electron-acrylic-window')
const { exec } = require('child_process');
const os = require("os")
const ua = require('universal-analytics');
const uuid = require('uuid/v4');
const { VerticalRefreshRateContext, addDisplayChangeListener } = require("win32-displayconfig");
const refreshCtx = new VerticalRefreshRateContext();

const setWindowPos = require("setwindowpos-binding")

let isDev = false
try {
  isDev = require("electron-is-dev");
} catch (e) { }
const regedit = require('regedit')
const Color = require('color')
const isAppX = (app.name == "twinkle-tray-appx" ? true : false)
const { WindowsStoreAutoLaunch } = (isAppX ? require('electron-winstore-auto-launch') : false);
const Translate = require('./Translate');

app.allowRendererProcessReuse = true

// Logging
const logPath = path.join(app.getPath("userData"), `\\debug${(isDev ? "-dev" : "")}.log`)
const updatePath = path.join(app.getPath("userData"), `\\update.exe`)

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

if (!isDev) console.log = () => { };

// Mouse wheel scrolling
let mouseEventsActive = false
let bounds

function enableMouseEvents() {
  if (mouseEventsActive) return false;
  mouseEventsActive = true;

  let mouseEvents
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
            sendToAllWindows("panelBlur")
            showPanel(false)
          }
        }

      }
    })

  } catch (e) {
    console.error(e)
  }

}




// Analytics

let analytics = false
let analyticsQueue = false
let analyticsInterval = false
let analyticsFrequency = 1000 * 60 * 10 // 10 minutes
let analyticsUsage = {}

function analyticsResetUsage() {
  analyticsUsage = {
    OpenedPanel: 0,
    OpenedSettings: 0,
    UsedSleep: 0,
    UsedHotkeys: 0
  }
}
analyticsResetUsage()

function analyticsData(data = {}) {
  if (analytics) {
    if (!analyticsQueue) {
      analyticsQueue = analytics
    }
    analyticsQueue.event(data)
  }
}

function getSettingsAnalytics() {

  let data = {
    updateRate: settings.updateInterval,
    usingRunAtLogin: settings.openAtLogin,
    usingRenames: false,
    usingReorder: false,
    usingNormalize: false,
    usingTimeAdjust: (settings.adjustmentTimes.length > 0 ? true : false),
    usingTimeAdjustIndividualDisplays: settings.adjustmentTimeIndividualDisplays,
    usingHotkeys: (Object.keys(settings.hotkeys).length > 0 ? true : false),
    usingLinkedLevels: settings.linkedLevelsActive,
    usingAutomaticUpdates: settings.checkForUpdates,
    trayIcon: settings.icon,
  }

  // Check if renames are used
  if (settings.names && Object.values(settings.names).length > 0) {
    for (let key in settings.names) {
      if (settings.names[key] != "") data.usingRenames = true;
    }
  }

  // Check if reorders are used
  for (let idx in monitors) {
    if (monitors[idx].order && monitors[idx].order != idx) {
      data.usingReorder = true
    }
  }

  // Check if normalization is used
  if (settings.remaps && Object.values(settings.remaps).length > 0) {
    for (let key in settings.remaps) {
      if (settings.remaps[key].max != 100 || settings.remaps[key].min != 0) data.usingNormalize = true;
    }
  }

  // Queue settings
  for (let key in data) {
    analyticsData({
      ec: "User Settings",
      ea: key,
      el: data[key]
    })
  }

  // Queue usage
  for (let key in analyticsUsage) {
    if (analyticsUsage[key] > 0) {
      analyticsData({
        ec: "User Activity",
        ea: key,
        el: analyticsUsage[key],
        ev: analyticsUsage[key]
      })
    }
  }

  console.log("\x1b[34mAnalytics:\x1b[0m ", data)
  console.log("\x1b[34mAnalytics:\x1b[0m ", analyticsUsage)

  analyticsResetUsage()

}




let monitors = {}
let mainWindow;
let tray = null
let lastTheme = false

const panelSize = {
  width: 356,
  height: 500,
  base: 0,
  visible: false
}



// Fix regedit tool path in production
if (!isDev) regedit.setExternalVBSLocation(path.join(path.dirname(app.getPath('exe')), '.\\resources\\node_modules\\regedit\\vbs'));



//
//
//    Settings init
//
//

if (!fs.existsSync(app.getPath("appData"))) {
  try {
    fs.mkdirSync(app.getPath("appData"), { recursive: true })
  } catch (e) {
    debug.error(e)
  }
}

const settingsPath = path.join(app.getPath("userData"), `\\settings${(isDev ? "-dev" : "")}.json`)

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
  checkTimeAtStartup: true,
  order: [],
  features: {
    luminance: true,
    brightness: true,
    gain: false,
    contrast: false,
    powerState: false,
    volume: false
  },
  checkForUpdates: !isDev,
  dismissedUpdate: '',
  language: "system",
  settingsVer: "v" + app.getVersion(),
  names: {},
  analytics: !isDev,
  scrollShortcut: true,
  useAcrylic: false,
  useNativeAnimation: false,
  uuid: uuid(),
  branch: "master"
}

let settings = Object.assign({}, defaultSettings)

function readSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      settings = Object.assign(settings, JSON.parse(fs.readFileSync(settingsPath)))
    } else {
      fs.writeFileSync(settingsPath, JSON.stringify({}))
    }
    debug.log('Settings loaded:', settings)
  } catch (e) {
    debug.error("Couldn't load settings", e)
  }

  // Overrides
  settings.isDev = isDev
  settings.killWhenIdle = false

  processSettings()
}

let writeSettingsTimeout = false
function writeSettings(newSettings = {}, processAfter = true) {
  settings = Object.assign(settings, newSettings)

  if (!writeSettingsTimeout) {
    writeSettingsTimeout = setTimeout(() => {
      // Save new settings
      try {
        fs.writeFile(settingsPath, JSON.stringify(settings), (e) => { if (e) debug.error(e) })
      } catch (e) {
        debug.error("Couldn't save settings.", settingsPath, e)
      }
      writeSettingsTimeout = false
    }, 333)
  }

  if (processAfter) processSettings(newSettings);
}


function processSettings(newSettings = {}) {

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
    }

    if (newSettings.hotkeys !== undefined) {
      applyHotkeys()
    }

    if (newSettings.language !== undefined) {
      getLocalization()
      setTrayMenu()
    }

    if (newSettings.useAcrylic !== undefined) {
      lastTheme["UseAcrylic"] = newSettings.useAcrylic
      handleTransparencyChange(lastTheme.EnableTransparency, newSettings.useAcrylic)
      sendToAllWindows('theme-settings', lastTheme)
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

    if (newSettings.branch) {
      lastCheck = false
      settings.dismissedUpdate = false
      checkForUpdates()
    }

    if (settings.analytics) {
      if (!analytics) {
        console.log("\x1b[34mAnalytics:\x1b[0m starting with UUID " + settings.uuid)
        analytics = ua('UA-146439005-2', settings.uuid)
        analytics.set("ds", "app")
        analytics.pageview(app.name + "/" + "v" + app.getVersion()).send()
        analytics.event({
          ec: "Session Information",
          ea: "Version",
          el: "v" + app.getVersion()
        }).event({
          ec: "Session Information",
          ea: "App Name",
          el: app.name
        }).event({
          ec: "Session Information",
          ea: "OS Version",
          el: os.release()
        }).event({
          ec: "Session Information",
          ea: "CPU Model",
          el: os.cpus()[0].model
        }).send()

        analyticsResetUsage()

        analyticsInterval = setInterval(() => {
          try {
            //getSettingsAnalytics()
            if (analytics && analyticsQueue) {
              console.log("\x1b[34mAnalytics:\x1b[0m Sending analytics")
              analyticsQueue.send()
              analyticsQueue = false
            }
          } catch (e) {
            console.log("\x1b[34mAnalytics:\x1b[0m Couldn't complete anaytics sync!", e)
          }
        }, analyticsFrequency)
      }
    } else {
      analytics = false
      if (analyticsInterval) {
        clearInterval(analyticsInterval)
      }
    }

    if (mainWindow && newSettings.isDev !== undefined) {
      mainWindow.close()
      setTimeout(() => {
        createPanel()
      }, 333)
    }

  } catch (e) {
    console.log("Couldn't process settings!", e)
  }

  monitorsThread.send({
    type: "settings",
    settings: settings
  })

  sendToAllWindows('settings-updated', settings)
}

const knownDisplaysPath = path.join(app.getPath("userData"), `\\known-displays${(isDev ? "-dev" : "")}.json`)
let updateKnownDisplaysTimeout

// Save all known displays to disk for future use
async function updateKnownDisplays() {

  // Reset timeout
  if (updateKnownDisplaysTimeout) clearTimeout(updateKnownDisplaysTimeout);
  // Wait a moment
  updateKnownDisplaysTimeout = setTimeout(async () => {
    try {

      // Get from file
      let known = getKnownDisplays()

      // Merge with existing displays
      Object.assign(known, monitors)

      // Write back to file
      fs.writeFileSync(knownDisplaysPath, JSON.stringify(known))
      console.log(`\x1b[36mSaved known displays!\x1b[0m`)
    } catch (e) {
      console.error("Couldn't update known displays file.")
    }
  }, 3000)

}

// Get known displays from file, along with current displays
function getKnownDisplays(useCurrentMonitors) {
  let known
  try {
    // Load known displays DB
    known = fs.readFileSync(knownDisplaysPath)
    known = JSON.parse(known)
  } catch (e) {
    known = {}
  }

  // Merge with existing displays
  if (useCurrentMonitors) {
    Object.assign(known, monitors)
  }

  return known
}

// Look up all known displays and re-apply last brightness
function setKnownBrightness(useCurrentMonitors = false) {

  console.log(`\x1b[36mSetting brightness for known displays\x1b[0m`)

  const known = getKnownDisplays(useCurrentMonitors)
  for (const hwid in known) {
    try {
      const monitor = known[hwid]

      // Apply brightness to valid display types
      if (monitor.type == "wmi" || (monitor.type == "ddcci" && monitor.brightnessType)) {
        updateBrightness(monitor.id, monitor.brightness, true)
      }
    } catch (e) { console.log("Couldn't set brightness for known display!") }
  }
  sendToAllWindows('monitors-updated', monitors);
}


function applyHotkeys() {
  if (settings.hotkeys !== undefined) {
    globalShortcut.unregisterAll()
    for (let hotkey of Object.values(settings.hotkeys)) {
      try {
        // Only apply if found
        if (hotkey.monitor == "all" || hotkey.monitor == "turn_off_displays" || Object.values(monitors).find(m => m.id == hotkey.monitor)) {
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
const doHotkey = (hotkey) => {
  const now = Date.now()
  if (!doingHotkey && (hotkeyThrottle[hotkey.monitor] === undefined || now > hotkeyThrottle[hotkey.monitor] + 100)) {
    hotkeyThrottle[hotkey.monitor] = now


    let showOverlay = true

    doingHotkey = true

    try {
      //refreshMonitors(false)
      analyticsUsage.UsedHotkeys++
      if (hotkey.monitor === "all" || (settings.linkedLevelsActive && hotkey.monitor != "turn_off_displays")) {

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
        sleepDisplays()
      } else {
        if (Object.keys(monitors).length) {
          const monitor = Object.values(monitors).find((m) => m.id == hotkey.monitor)
          if (monitor) {
            let normalizedAdjust = minMax((settings.hotkeyPercent * hotkey.direction) + monitor.brightness)
            monitors[monitor.key].brightness = normalizedAdjust
            sendToAllWindows('monitors-updated', monitors);
            updateBrightnessThrottle(monitor.id, monitors[monitor.key].brightness, true, false)
            pauseMonitorUpdates() // Stop incoming updates for a moment to prevent judder
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

function hotkeyOverlayStart(timeout = 3000, force = false) {
  if (canReposition) {
    hotkeyOverlayShow()
  }
  clearTimeout(hotkeyOverlayTimeout)
  hotkeyOverlayTimeout = setTimeout(() => hotkeyOverlayHide(force), timeout)
}

async function hotkeyOverlayShow() {
  if (!mainWindow) return false;

  sendToAllWindows("display-mode", "overlay")
  let monitorCount = 0
  Object.values(monitors).forEach((monitor) => {
    if (monitor.type === "ddcci" || monitor.type === "wmi") monitorCount++;
  })

  if (monitorCount && settings.linkedLevelsActive) {
    monitorCount = 1
  }

  canReposition = false
  if (settings.useAcrylic) {
    tryVibrancy(mainWindow, { theme: "#26262601", effect: "blur" })
  }
  mainWindow.setIgnoreMouseEvents(false)
  await toggleTray(true, true)

  const panelOffset = 40
  mainWindow.setBounds({
    width: 26 + (40 * monitorCount),
    height: 138,
    x: panelOffset + 10,
    y: panelOffset + 20
  })

  mainWindow.setOpacity(1)

}

function hotkeyOverlayHide(force = false) {
  if (!mainWindow) {
    hotkeyOverlayStart(333)
    return false
  }
  if (!force && mainWindow && mainWindow.isFocused()) {
    hotkeyOverlayStart(333)
    return false;
  }
  clearTimeout(hotkeyOverlayTimeout)
  mainWindow.setOpacity(0)
  canReposition = true
  mainWindow.setIgnoreMouseEvents(true)
  sendToAllWindows("panelBlur")
  hotkeyOverlayTimeout = false
  sendToAllWindows("display-mode", "normal")
  repositionPanel()
  if (!settings.useAcrylic || !settings.useNativeAnimation) {
    tryVibrancy(mainWindow, "#00000000")
  }
}

function applyOrder() {
  for (let key in monitors) {
    const monitor = monitors[key]
    for (let order of settings.order) {
      if (monitor.id == order.id) {
        monitor.order = order.order
      }
    }
  }
}

function applyRemaps() {
  for (let key in monitors) {
    const monitor = monitors[key]
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
      if (openAtLogin) {
        WindowsStoreAutoLaunch.enable()
      } else {
        WindowsStoreAutoLaunch.disable()
      }
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
  localization.detected = (settings.language == "system" ? app.getLocale().split("-")[0] : settings.language)

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

ipcMain.on('send-settings', (event, newSettings) => {
  console.log("Recieved new settings", newSettings)
  writeSettings(newSettings)
})

ipcMain.on('request-settings', (event) => {
  getThemeRegistry() // Technically, it doesn't belong here, but it's a good place to piggy-back off of
  getSettings()
})

ipcMain.on('reset-settings', () => {
  settings = Object.assign({}, defaultSettings)
  console.log("Resetting settings")
  writeSettings({ userClosedIntro: true })
})

// Get the user's Windows Personalization settings
function getThemeRegistry() {

  if (lastTheme) sendToAllWindows('theme-settings', lastTheme)

  regedit.list('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', function (err, results) {
    try {
      if (err) {
        debug.error("Couldn\'t find theme key.", err)
      } else {

        // We only need the first one, but for some reason this module returns it as an object with a key of the registry key's name. So we have to iterate through the object and just get the first one.
        if (results)
          for (let result in results) {
            let themeSettings = Object.assign(results[result].values, {})

            // We don't need the type, so dump it
            for (let value in themeSettings) {
              themeSettings[value] = themeSettings[value].value
            }
            themeSettings["UseAcrylic"] = settings.useAcrylic
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
            break; // Only the first one is needed
          }

      }
    } catch (e) {
      debug.error("Couldn\'t get theme info.", e)
    }

  })

  // Taskbar position
  // For use only if auto-hide is on
  regedit.list('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StuckRects3', function (err, results) {
    let taskbarPos = false
    if (err) {
      debug.error(`Couldn't find taskbar settings.`, err)
    } else {
      try {
        if (results)
          for (let result in results) {
            if (results[result].values.Settings) {
              taskbarPos = results[result].values.Settings.value[12] * 1
              detectedTaskbarHeight = results[result].values.Settings.value[20] * 1
              detectedTaskbarHide = (results[result].values.Settings.value[8] * 1 === 3 ? true : false) // 3 = auto-hide
            }
          }
      } catch (e) {
        debug.error(`Couldn't read taskbar settings.`, e)
      }
    }
    if (taskbarPos !== false || settings.useTaskbarRegistry) {
      switch (taskbarPos) {
        case 0: detectedTaskbarPos = "LEFT"; break;
        case 1: detectedTaskbarPos = "TOP"; break;
        case 2: detectedTaskbarPos = "RIGHT"; break;
        case 3: detectedTaskbarPos = "BOTTOM"; break;
      }
    }
  })
}

function getTrayIconPath() {
  const themeDir = (lastTheme && lastTheme.SystemUsesLightTheme ? 'light' : 'dark')
  let icon = "icon";
  if (settings.icon === "mdl2") {
    icon = settings.icon
  }
  return path.join(__dirname, `assets/tray-icons/${themeDir}/${icon}.ico`)
}

function getAccentColors() {
  let detectedAccent = "0078d7"
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
  return {
    accent: adjustedAccent.hex(),
    lighter: matchLumi(accent, 0.85).hex(),
    light: matchLumi(accent, 0.52).hex(),
    medium: matchLumi(accent, 0.48).hex(),
    mediumDark: matchLumi(accent, 0.33).desaturate(0.1).hex(),
    dark: matchLumi(accent, 0.275).desaturate(0.1).hex(),
    transparent: matchLumi(accent, 0.275).desaturate(0.1).rgb().string()
  }
}

// 0 = off
// 1 = transparent
// 2 = blur
let currentTransparencyStyle
function handleTransparencyChange(transparent = true, blur = false) {
  const style = (transparent ? (blur ? 2 : 1) : 0)
  if (style !== currentTransparencyStyle) {
    currentTransparencyStyle = style
  }
  sendToAllWindows("transparencyStyle", style)
  if (style === 2) {
    if (settingsWindow) {
      tryVibrancy(settingsWindow, determineTheme(settings.theme))
    }
  } else {
    if (settingsWindow) {
      tryVibrancy(settingsWindow)
      settingsWindow.setBackgroundColor("#00000000")
    }
  }
}

function tryVibrancy(window, value = null) {
  if (!window) return false;
  try {
    window.getBounds()
    window.setVibrancy(value)
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
    monitorsThread.send({
      type: "refreshMonitors",
      fullRefresh
    })

    let timeout = setTimeout(() => {
      reject("Monitor thread timed out.")
    }, 10000)

    function listen(resolve) {
      monitorsThread.once("message", data => {
        if (data.type === "refreshMonitors") {
          clearTimeout(timeout)
          resolve(data.monitors)
        } else {
          listen(resolve)
        }
      })
    }
    listen(resolve)
  })
}


refreshMonitors = async (fullRefresh = false, bypassRateLimit = false) => {

  if (pausedMonitorUpdates) {
    console.log("Sorry, no updates right now!")
    return monitors
  }

  // Don't do 2+ refreshes at once
  if (!fullRefresh && isRefreshing) {
    console.log(`Already refreshing. Aborting.`)
    return monitors;
  }

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

  try {
    newMonitors = await refreshMonitorsJob(fullRefresh)
    monitors = newMonitors
    lastEagerUpdate = Date.now()
  } catch (e) {
    console.log('Couldn\'t refresh monitors', e)
  }

  isRefreshing = false
  applyOrder()
  applyRemaps()
  applyHotkeys()

  // Only send update if something changed
  if (JSON.stringify(newMonitors) !== JSON.stringify(oldMonitors)) {
    setTrayPercent()
    updateKnownDisplays()
    sendToAllWindows('monitors-updated', monitors)
  } else {
    console.log("===--- NO CHANGE ---===")
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
//    Brightness updates
//
//


let updateBrightnessTimeout = false
let updateBrightnessQueue = []
let lastBrightnessTimes = []
function updateBrightnessThrottle(id, level, useCap = true, sendUpdate = true) {
  let idx = updateBrightnessQueue.length
  const found = updateBrightnessQueue.findIndex(item => item.id === id)
  updateBrightnessQueue[(found > -1 ? found : idx)] = {
    id,
    level,
    useCap
  }
  const now = Date.now()
  if (lastBrightnessTimes[id] === undefined || now >= lastBrightnessTimes[id] + settings.updateInterval) {
    lastBrightnessTimes[id] = now
    updateBrightness(id, level, useCap)
    if (sendUpdate) sendToAllWindows('monitors-updated', monitors);
    return true
  } else if (!updateBrightnessTimeout) {
    lastBrightnessTimes[id] = now
    updateBrightnessTimeout = setTimeout(() => {
      const updateBrightnessQueueCopy = updateBrightnessQueue.splice(0)
      for (let bUpdate of updateBrightnessQueueCopy) {
        if (bUpdate) {
          try {
            updateBrightness(bUpdate.id, bUpdate.level, bUpdate.useCap)
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




function updateBrightness(index, level, useCap = true) {

  let monitor = false
  if (typeof index == "string" && index * 1 != index) {
    monitor = Object.values(monitors).find((display) => {
      return display.id.indexOf(index) === 0
    })
  } else {
    if (index >= Object.keys(monitors).length) {
      console.log("updateBrightness: Invalid monitor")
      return false;
    }
    monitor = monitors[index]
  }

  try {
    const normalized = normalizeBrightness(level, false, (useCap ? monitor.min : 0), (useCap ? monitor.max : 100))
    monitor.brightness = level

    if (monitor.type == "ddcci") {
      monitorsThread.send({
        type: "brightness",
        brightness: normalized * ((monitor.brightnessMax || 100) / 100),
        id: monitor.id
      })
    } else if (monitor.type == "wmi") {
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

function normalizeBrightness(brightness, unnormalize = false, min = 0, max = 100) {
  let level = brightness
  if (level > 100) level = 100;
  if (level < 0) level = 0;
  if (min > 0 || max < 100) {
    let out = level
    if (!unnormalize) {
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
function transitionBrightness(level, eventMonitors = []) {
  if (currentTransition !== null) clearInterval(currentTransition);
  currentTransition = setInterval(() => {
    let numDone = 0
    for (let key in monitors) {
      const monitor = monitors[key]

      let normalized = level
      if (settings.adjustmentTimeIndividualDisplays) {
        // If using individual monitor settings
        normalized = (eventMonitors[monitor.id] >= 0 ? eventMonitors[monitor.id] : level)
      }

      if (settings.remaps) {
        for (let remapName in settings.remaps) {
          if (remapName == monitor.name) {
            let remap = settings.remaps[remapName]
            normalized = normalized
          }
        }
      }
      if (monitor.brightness < normalized + 3 && monitor.brightness > normalized - 3) {
        updateBrightness(monitor.id, normalized)
        numDone++
      } else {
        updateBrightness(monitor.id, ((monitor.brightness * 2) + normalized) / 3)
      }
      if (numDone === Object.keys(monitors).length) {
        clearInterval(currentTransition);
      }
    }
  }, settings.updateInterval * 1)
}

function sleepDisplays() {
  analyticsUsage.UsedSleep++
  setTimeout(() => {
    exec(`powershell.exe (Add-Type '[DllImport(\\"user32.dll\\")]^public static extern int SendMessage(int hWnd, int hMsg, int wParam, int lParam);' -Name a -Pas)::SendMessage(-1,0x0112,0xF170,2)`)
  }, 333)
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
})

ipcMain.on('update-brightness', function (event, data) {
  console.log(`Update brightness recieved: ${data.index} - ${data.level}`)
  updateBrightness(data.index, data.level)
})

ipcMain.on('request-monitors', function (event, arg) {
  sendToAllWindows("monitors-updated", monitors)
  refreshMonitors(false, true)
})

ipcMain.on('full-refresh', function (event, forceUpdate = false) {
  refreshMonitors(true, true).then(() => {
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
  }
})

ipcMain.on('get-update', (event, version) => {
  latestVersion.error = false
  getLatestUpdate(version)
})

ipcMain.on('panel-height', (event, height) => {
  panelSize.height = height
  if (panelSize.visible && !isAnimatingPanel) {
    repositionPanel()
  }
})

ipcMain.on('panel-hidden', () => {
  sendToAllWindows("display-mode", "normal")
  panelState = "hidden"
  if (settings.killWhenIdle) mainWindow.close()
})

ipcMain.on('show-acrylic', () => {
  if (settings.useAcrylic && !settings.useNativeAnimation) {
    if (lastTheme && lastTheme.ColorPrevalence) {
      tryVibrancy(mainWindow, { theme: getAccentColors().dark + (settings.useAcrylic ? "D0" : "70"), effect: (settings.useAcrylic ? "acrylic" : "blur") })
    } else {
      console.log(nativeTheme.themeSource)
      tryVibrancy(mainWindow, { theme: (lastTheme && nativeTheme.themeSource === "light" ? (settings.useAcrylic ? "#DBDBDBDD" : "#DBDBDB70") : (settings.useAcrylic ? "#292929DD" : "#29292970")), effect: (settings.useAcrylic ? "acrylic" : "blur") })
    }
  }
  sendToAllWindows("set-acrylic-show")
})

ipcMain.on('apply-last-known-monitors', () => { setKnownBrightness() })

ipcMain.on('sleep-displays', sleepDisplays)


//
//
//    Initialize Panel
//
//

let panelState = "hidden"
let panelReady = false

function createPanel(toggleOnLoad = false) {

  console.log("Creating panel...")

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
    opacity: 0,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    type: "toolbar",
    vibrancy: {
      theme: false,
      disableOnBlur: false,
      useCustomWindowRefreshMethod: false,
      effect: 'blur'
    },
    maximizable: false,
    minimizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'panel-preload.js'),
      devTools: settings.isDev,
      enableRemoteModule: true,
      contextIsolation: false,
      webgl: false,
      plugins: false,
      backgroundThrottling: false,
      spellcheck: false,
      enableWebSQL: false,
      v8CacheOptions: "none"
    }
  });

  mainWindow.setAlwaysOnTop(true, 'modal-panel')

  mainWindow.loadURL(
    isDev
      ? "http://localhost:3000/index.html"
      : `file://${path.join(__dirname, "../build/index.html")}`
  );

  mainWindow.on("closed", () => (mainWindow = null));

  mainWindow.once('ready-to-show', () => {
    panelReady = true
    console.log("Panel ready!")
    mainWindow.show()
    createTray()

    if (toggleOnLoad) setTimeout(() => { toggleTray(false) }, 33);
  })

  mainWindow.on("blur", () => {
    // Only run when not in an overlay
    if (canReposition) {
      sendToAllWindows("panelBlur")
      showPanel(false)
    }
  })

  mainWindow.on('move', (e) => {
    e.preventDefault()
  })

  mainWindow.on('resize', (e) => {
    e.preventDefault()
  })

  mainWindow.webContents.once('dom-ready', () => {
    sendToAllWindows('monitors-updated', monitors)
    // Do full refreshes shortly after startup in case Windows isn't ready.
    setTimeout(() => { sendToAllWindows("force-refresh-monitors") }, 3500)
    setTimeout(() => { sendToAllWindows("force-refresh-monitors") }, 8000)
    setTimeout(() => { sendToAllWindows("force-refresh-monitors") }, 17000)
  })

}

function restartPanel() {
  if (mainWindow) {
    mainWindow.close()
    mainWindow = null
    createPanel()
  }
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
  if (!canReposition) {
    mainWindow.setBounds({
      width: panelSize.width,
      height: panelSize.height
    })
    return false
  }
  let primaryDisplay = getPrimaryDisplay()

  function taskbarPosition() {
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
        y: primaryDisplay.bounds.y + primaryDisplay.workArea.height - panelSize.height
      })
    }
    panelSize.base = mainWindow.getBounds().y
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
        sendToAllWindows("playPanelAnimation")
        mainWindow.setOpacity(0)
        mainWindow.setBounds(panelSize.bounds)
      }
      mainWindow.setOpacity(1)
    }


  } else {
    // Hide panel
    mainWindow.setOpacity(0)
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
      mainWindow.setBackgroundColor("#00000000")
    }
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
  readSettings()
  getLocalization()

  refreshMonitors(true, true).then(() => {
    if (settings.brightnessAtStartup) setKnownBrightness();
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

  tray = new Tray(getTrayIconPath())
  tray.setToolTip('Twinkle Tray' + (isDev ? " (Dev)" : ""))
  setTrayMenu()
  tray.on("click", async () => toggleTray(true))
  tray.on('mouse-move', async () => {
    bounds = tray.getBounds()
    bounds = screen.dipToScreenRect(null, bounds)
    tryEagerUpdate()
  })
  nativeTheme.on('updated', async () => {
    getThemeRegistry()
    try {
      tray.setImage(getTrayIconPath())
    } catch (e) {
      debug.log("Couldn't update tray icon!", e)
    }
  })
}

function setTrayMenu() {
  if (tray === null) return false;

  const contextMenu = Menu.buildFromTemplate([
    { label: T.t("GENERIC_SETTINGS"), type: 'normal', click: createSettings },
    { label: T.t("GENERIC_QUIT"), type: 'normal', click: quitApp }
  ])
  tray.setContextMenu(contextMenu)
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
    tryEagerUpdate()
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
        mainWindow.setOpacity(0)
        hotkeyOverlayHide()
        setTimeout(() => {
          sendToAllWindows("display-mode", "normal")
          toggleTray(doRefresh, isOverlay)
        }, 300)
        return false
      }

      sendToAllWindows("display-mode", "normal")
      showPanel(true, panelSize.height)
      panelState = "visible"
      mainWindow.focus()
    } else {
      sendToAllWindows("display-mode", "overlay")
      panelState = "overlay"
      analyticsUsage.OpenedPanel++
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
    webPreferences: {
      preload: path.join(__dirname, 'intro-preload.js'),
      devTools: settings.isDev,
      enableRemoteModule: true,
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
    introWindow.show()
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
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      devTools: settings.isDev,
      enableRemoteModule: true,
      contextIsolation: false
    }
  });

  settingsWindow.loadURL(
    isDev
      ? "http://localhost:3000/settings.html"
      : `file://${path.join(__dirname, "../build/settings.html")}`
  );

  settingsWindow.on("closed", () => (settingsWindow = null));

  settingsWindow.once('ready-to-show', () => {

    // Show after a very short delay to avoid visual bugs
    setTimeout(() => {
      settingsWindow.show()
      if (settings.useAcrylic) {
        tryVibrancy(settingsWindow, determineTheme(settings.theme))
      }
    }, 100)

    // Prevent links from opening in Electron
    settingsWindow.webContents.on('will-navigate', (e, url) => {
      if (url.indexOf("http://localhost:3000") !== 0 || url.indexOf("file://") !== 0) return false;
      e.preventDefault()
      require('electron').shell.openExternal(url)
    })
  })

  refreshMonitors(true)

  analyticsUsage.OpenedSettings++

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
  lastCheck = new Date().getDate()
  try {
    const fetch = require('node-fetch');
    if (isAppX === false) {
      console.log("Checking for updates...")
      fetch("https://api.github.com/repos/xanderfrangos/twinkle-tray/releases").then((response) => {
        response.json().then((releases) => {
          let foundVersion = false
          for (let release of releases) {
            if (release.target_commitish == settings.branch) {
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

  addDisplayChangeListener(handleMonitorChange)

  enableMouseEvents()

  if (settings.checkTimeAtStartup) {
    lastTimeEvent = false;
    setTimeout(handleBackgroundUpdate, 2500)
  }
  restartBackgroundUpdate()
}

function handleAccentChange() {
  sendToAllWindows('update-colors', getAccentColors())
  getThemeRegistry()
}

let skipFirstMonChange = false
let handleChangeTimeout
function handleMonitorChange(e, d) {

  // Skip event that happens at startup
  if (!skipFirstMonChange) {
    skipFirstMonChange = true
    return false
  }

  // Defer actions for a moment just in case of repeat events
  if (!handleChangeTimeout) {
    handleChangeTimeout = setTimeout(() => {

      // Reset all known displays
      refreshMonitors(true, true).then(() => {
        // If displays not shown, refresh mainWindow
        if (!panelSize.visible)
          restartPanel()
      })

      handleChangeTimeout = false
    }, 1500)
  }

}

// Handle resume from sleep/hibernation
powerMonitor.on("resume", () => {

  setTimeout(
    () => {
      refreshMonitors().then(() => {
        // Set brightness to last known settings
        setKnownBrightness()
        restartPanel()

        // Check if time adjustments should apply
        handleBackgroundUpdate()
      })
    },
    1500 // Give Windows a few seconds to... you know... wake up.
  )

})

let restartBackgroundUpdateThrottle = false
function restartBackgroundUpdate() {
  if (!restartBackgroundUpdateThrottle) {
    restartBackgroundUpdateThrottle = setTimeout(() => {
      restartBackgroundUpdateThrottle = false
      clearInterval(backgroundInterval)
      backgroundInterval = setInterval(handleBackgroundUpdate, (isDev ? 8000 : 60000 * 1))
      handleBackgroundUpdate()
    }, 3000)
  } else {
    clearTimeout(restartBackgroundUpdateThrottle)
    restartBackgroundUpdateThrottle = false
    restartBackgroundUpdate()
  }
}

let lastTimeEvent = {
  hour: new Date().getHours(),
  minute: new Date().getMinutes(),
  day: new Date().getDate()
}
function handleBackgroundUpdate() {

  try {
    // Time of Day Adjustments
    if (settings.adjustmentTimes.length > 0) {
      const date = new Date()
      const hour = date.getHours()
      const minute = date.getMinutes()

      // Reset on new day
      if (lastTimeEvent && lastTimeEvent.day != date.getDate()) {
        console.log("New day, resettings lastTimeEvent")
        lastTimeEvent = false
      }

      // Find most recent event
      let foundEvent = false
      for (let event of settings.adjustmentTimes) {
        const eventHour = (event.hour * 1) + (event.am == "PM" && (event.hour * 1) != 12 ? 12 : (event.am == "AM" && (event.hour * 1) == 12 ? -12 : 0))
        const eventMinute = event.minute * 1
        // Check if event is not later than current time, last event time, or last found time
        if (hour >= eventHour || (hour == eventHour && minute >= eventMinute)) {
          // Check if found event is greater than last found event
          if (foundEvent === false || foundEvent.hour < eventHour || (foundEvent.hour == eventHour && foundEvent.minute <= eventMinute)) {
            foundEvent = Object.assign({}, event)
            foundEvent.minute = eventMinute
            foundEvent.hour = eventHour
          }
        }
      }
      if (foundEvent) {
        if (lastTimeEvent == false || lastTimeEvent.hour < foundEvent.hour || (lastTimeEvent.hour == foundEvent.hour && lastTimeEvent.minute < foundEvent.minute)) {
          console.log("Adjusting brightness automatically", foundEvent)
          lastTimeEvent = Object.assign({}, foundEvent)
          lastTimeEvent.day = new Date().getDate()
          refreshMonitors(true, true).then(() => {
            transitionBrightness(foundEvent.brightness, (foundEvent.monitors ? foundEvent.monitors : {}))
          })
        }
      }
    }
  } catch (e) {
    console.error(e)
  }

  checkForUpdates()

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

--Overlay
Flag to show brightness levels in the overlay
Example: --Overlay

*/
function handleCommandLine(event, commandLine) {

  let display
  let type
  let brightness

  try {

    if (commandLine.length <= 2 && mainWindow) {
      toggleTray()
    }
    if (commandLine.length > 2) {

      commandLine.forEach(arg => {

        // Get display by index
        if (arg.indexOf("--monitornum=") === 0) {
          display = Object.values(monitors)[(arg.substring(13) * 1) - 1]
        }

        // Get display by ID (partial or whole)
        if (arg.indexOf("--monitorid=") === 0) {
          const monID = Object.keys(monitors).find(id => {
            return id.indexOf(arg.substring(12)) >= 0
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

        // Show overlay
        if (arg.indexOf("--overlay") === 0 && panelState !== "visible") {
          hotkeyOverlayStart()
        }

      })

      // If value input, update brightness
      if (display && type && brightness) {

        if (display === "all") {
          console.log(`Setting brightness via command line: All @ ${brightness}%`);
          updateAllBrightness(brightness, type)
        } else {
          const newBrightness = minMax(type === "set" ? brightness : display.brightness + brightness)
          console.log(`Setting brightness via command line: Display #${display.num} (${display.name}) @ ${newBrightness}%`);
          updateBrightnessThrottle(display.id, newBrightness, true)
        }

      }

    }

  } catch (e) {
    console.log(e)
  }

}


// Monitors thread
// Handles WMI + DDC/CI activity

let monitorsThread
function startMonitorThread() {
  monitorsThread = fork(path.join(__dirname, 'Monitors.js'), ["--isdev=" + isDev, "--apppath=" + app.getAppPath()], { silent: false })
}
startMonitorThread()
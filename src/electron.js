const path = require('path');
const fs = require('fs')
const { nativeTheme, systemPreferences, Menu, Tray, BrowserWindow, ipcMain, app, screen, globalShortcut } = require('electron')
const { exec } = require('child_process');
const os = require("os")
const ua = require('universal-analytics');
const uuid = require('uuid/v4');

let isDev = false
try {
  isDev = require("electron-is-dev");
} catch (e) { }
const regedit = require('regedit')
const Color = require('color')
const isAppX = (app.getName() == "twinkle-tray-appx" ? true : false)
const { WindowsStoreAutoLaunch } = (isAppX ? require('electron-winstore-auto-launch') : false);
const Translate = require('./Translate')

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
    fs.appendFile(logPath, arg, () => { })
  }
}

const debug = {
  log,
  error: log
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

function analyticsData(data = { }) {
  if(analytics) {
    if(!analyticsQueue) {
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
  }

  // Check if renames are used
  if(settings.names && Object.values(settings.names).length > 0) {
    for(let key in settings.names) {
      if(settings.names[key] != "") data.usingRenames = true;
    }
  } 

  // Check if reorders are used
  for(let idx in monitors) {
    if(monitors[idx].order && monitors[idx].order != idx) {
      data.usingReorder = true
    }
  }

  // Check if normalization is used
  if(settings.remaps && Object.values(settings.remaps).length > 0) {
    for(let key in settings.remaps) {
      if(settings.remaps[key].max != 100 || settings.remaps[key].min != 0) data.usingNormalize = true;
    }
  } 

  // Queue settings
  for(let key in data) {
    analyticsData({
          ec: "User Settings",
          ea: key,
          el: data[key]
    })
  }

  // Queue usage
  for(let key in analyticsUsage) {
    if(analyticsUsage[key] > 0) {
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


const ddcci = require("@hensm/ddcci");
if (isDev) {
  var WmiClient = require('wmi-client');
} else {
  var WmiClient = require(path.join(app.getAppPath(), '../node_modules/wmi-client'));
}


let monitors = []
let connectedMonitors = []
let monitorNames = []
let mainWindow;
let tray = null
let lastTheme = false

const panelSize = {
  width: 356,
  height: 500
}

var wmi = new WmiClient({
  host: 'localhost',
  namespace: '\\\\root\\WMI'
});

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
  userClosedIntro: false,
  theme: "default",
  updateInterval: 500,
  openAtLogin: false,
  killWhenIdle: false,
  remaps: {},
  hotkeys: {},
  hotkeyPercent: 10,
  adjustmentTimes: [],
  adjustmentTimeIndividualDisplays: false,
  checkTimeAtStartup: true,
  order: [],
  checkForUpdates: !isDev,
  dismissedUpdate: '',
  language: "system",
  settingsVer: "v" + app.getVersion(),
  names: {},
  analytics: !isDev,
  uuid: uuid()
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

  if (false && settings.killWhenIdle && mainWindow && mainWindow.isAlwaysOnTop() === false) {
    mainWindow.close()
  }

  if (newSettings.adjustmentTimes !== undefined) {
    lastTimeEvent = false
    restartBackgroundUpdate()
  }

  if (newSettings.hotkeys !== undefined) {
    applyHotkeys()
  }

  if(newSettings.language !== undefined) {
    getLocalization()
  }

  if (newSettings.checkForUpdates !== undefined) {
    if (newSettings.checkForUpdates === false) {
      latestVersion = false
      sendToAllWindows('latest-version', latestVersion);
    } else {
      lastCheck = false
    }

  }

  if(settings.analytics) {
    if(!analytics) {
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
        ea: "Platform",
        el: os.platform()
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
          getSettingsAnalytics()
          if(analytics && analyticsQueue) {
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
    if(analyticsInterval) {
      clearInterval(analyticsInterval)
    }
  }

  } catch (e) {
    console.log("Couldn't process settings!", e)
  }

  sendToAllWindows('settings-updated', settings)
}


function applyHotkeys() {
  if (settings.hotkeys !== undefined) {
    globalShortcut.unregisterAll()
    for (let hotkey of Object.values(settings.hotkeys)) {
      try {
        hotkey.active = globalShortcut.register(hotkey.accelerator, () => {
          analyticsUsage.UsedHotkeys++
          if (hotkey.monitor === "all") {
            for (let monitor of monitors) {
              let normalizedAdjust = normalizeBrightness(monitor.brightness, false, monitor.min, monitor.max)
              updateBrightnessThrottle(monitor.id, normalizedAdjust + (settings.hotkeyPercent * hotkey.direction), true)
            }
          } else {
            const monitor = monitors.find((m) => m.id == hotkey.monitor)
            if(monitor) {
              let normalizedAdjust = normalizeBrightness(monitor.brightness, false, monitor.min, monitor.max)
              updateBrightnessThrottle(monitor.id, normalizedAdjust + (settings.hotkeyPercent * hotkey.direction), true)
            }
          }
        })
      } catch(e) {
        
      }
      
    }
    sendToAllWindows('settings-updated', settings)
  }
}

function applyOrder() {
  for (let monitor of monitors) {
    for (let order of settings.order) {
      if (monitor.id == order.id) {
        monitor.order = order.order
      }
    }
  }
}

function applyRemaps() {
  for (let monitor of monitors) {
    if (settings.remaps) {
      for (let remapName in settings.remaps) {
        if (remapName == monitor.name) {
          let remap = settings.remaps[remapName]
          monitor.min = remap.min
          monitor.max = remap.max
        }
      }
    }
  }
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
    const defaultFile = fs.readFileSync(path.join(__dirname, `/localization/default.json`))
    localization.default = JSON.parse(defaultFile)
  } catch(e) {
    console.error("Couldn't read default langauge file!")
  }

  // Get user's local localization file, if available
  localization.desired = {}
  const langPath = path.join(__dirname, `/localization/${localization.detected}.json`)
  if(fs.existsSync(langPath)) {
    try {
      const desiredFile = fs.readFileSync(langPath)
      localization.desired = JSON.parse(desiredFile)
    } catch(e) {
      console.error(`Couldn't read language file: ${localization.detected}.json`)
    }
  }

  T = new Translate(localization.desired, localization.default)
  sendToAllWindows("localization-updated", localization)
  getAllLanguages()
  
}

function getAllLanguages() {
  fs.readdir(path.join(__dirname, `/localization/`), (err, files) => {
    if(!err) {
      let languages = []
      for(let file of files) {
        try {
          const langText = fs.readFileSync(path.join(__dirname, `/localization/`, file))
          const langName = JSON.parse(langText)["LANGUAGE"]
          languages.push({
            id: file.split(".")[0],
            name: langName
          })
        } catch(e) {
          console.error(`Error reading language from ${file}`)
        }
      }
      localization.languages = languages
      sendToAllWindows("localization-updated", localization)
    }
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

            // Send it off!
            sendToAllWindows('theme-settings', themeSettings)
            lastTheme = themeSettings
            if (tray) {
              tray.setImage((themeSettings.SystemUsesLightTheme ? path.join(__dirname, 'assets/light-theme/icon.ico') : path.join(__dirname, 'assets/icon.ico')))
            }
            break; // Only the first one is needed
          }

      }
    } catch (e) {
      debug.error("Couldn\'t get theme info.", e)
    }

  })
}

function getAccentColors() {
  const accent = Color("#" + systemPreferences.getAccentColor().substr(0, 6), "hex")
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


//
//
//    Monitor updates
//
//

refreshMonitors = async () => {

  let foundMonitors = []
  let local = 0

  // First, let's get DDC/CI monitors. They're easy.
  ddcci._refresh()
  const ddcciMonitors = ddcci.getMonitorList()

  for (let monitor of ddcciMonitors) {
    try {
      foundMonitors.push({
        name: makeName(monitor, `Display ${local + 1}`),
        id: monitor,
        num: local,
        localID: local,
        brightness: ddcci.getBrightness(monitor),
        type: 'ddcci',
        min: 0,
        max: 100
      })
    } catch (e) {
      // Probably failed to get VCP code, which means the display is not compatible
    }
    local++
  }

  // Next, let's request WMI monitors.
  // This part is a pain in the ass because of how finicky WMI queries/clients are.
  // We just return an empty array if anything goes wrong.

  let wmiMonitors = await new Promise((resolve, reject) => {
    try {
      wmi.query('SELECT * FROM WmiMonitorBrightness', function (err, result) {
        let out = []
        if (err != null) {
          resolve([])
        } else if (result) {
          let local = 0
          for (let monitor of result) {
            out.push({
              name: makeName(monitor.InstanceName, `Display ${local + 1}`),
              id: monitor.InstanceName,
              num: local,
              localID: local,
              brightness: monitor.CurrentBrightness,
              type: 'wmi',
              min: 0,
              max: 100
            })
            local++
          }
          resolve(out)
        } else {
          resolve([])
        }
      });

    } catch (e) {
      debug.log(e)
      resolve([])
    }
  })

  // Add WMI monitors, if available

  if (wmiMonitors && wmiMonitors.length > 0) {
    for (mon of wmiMonitors) {
      foundMonitors.push(mon)
      local++
    }
  }

  // Basic info acquired, send it off

  monitors = foundMonitors
  applyOrder()
  sendToAllWindows('monitors-updated', monitors)

  // Get names

  refreshNames(() => {
    sendToAllWindows('names-updated', monitors)
  })
}

function makeName(monitorDevice, fallback) {
  if (monitorNames[monitorDevice] !== undefined) {
    return monitorNames[monitorDevice]
  } else {
    return fallback;
  }
}



//
//
//    Brightness updates
//
//


let updateBrightnessTimeout = false
let updateBrightnessQueue = []
function updateBrightnessThrottle(id, level, useCap = false) {
  const idx = updateBrightnessQueue.find(item => item.id === id) || updateBrightnessQueue.length
  console.log(idx, id)
  updateBrightnessQueue[idx] = {
    id,
    level,
    useCap
  }
  if (!updateBrightnessTimeout) {
    updateBrightnessTimeout = setTimeout(() => {
      const updateBrightnessQueueCopy = updateBrightnessQueue.splice(0)
      for (let bUpdate of updateBrightnessQueueCopy) {
        if(bUpdate) {
          try {
            console.log(bUpdate)
            updateBrightness(bUpdate.id, bUpdate.level, bUpdate.useCap)
          } catch(e) {
            console.error(e)
            console.error(bUpdate)
          }
        }
      }
      updateBrightnessTimeout = false
      sendToAllWindows('monitors-updated', monitors)
    }, settings.updateInterval)
  }
}



function updateBrightness(index, level, useCap = false) {

  let monitor = false
  if(typeof index == "string" && index * 1 != index) {
    monitor = monitors.find((display) => {
      return display.id.indexOf(index) === 0
    })
  } else {
    if (index >= monitors.length) {
      console.log("updateBrightness: Invalid monitor")
      return false;
    }
    monitor = monitors[index]
  }
  
  const brightness = normalizeBrightness(level, true, (useCap ? monitor.min : 0), (useCap ? monitor.max : 100))
  try {
    monitor.brightness = brightness
    if (monitor.type == "ddcci") {
      ddcci.setBrightness(monitor.id, brightness)
    } else if (monitor.type == "wmi") {
      exec(`powershell.exe (Get-WmiObject -Namespace root\\wmi -Class WmiMonitorBrightnessMethods).wmisetbrightness(0, ${brightness})"`)
    }
  } catch (e) {
    debug.error("Could not update brightness", e)
  }
}

function normalizeBrightness(brightness, sending = false, min = 0, max = 100) {
  let level = brightness
  if (level > 100) level = 100;
  if (level < 0) level = 0;
  if (min > 0 || max < 100) {
    let out = level
    if (sending) {
      out = (min + ((level / 100) * (max - min)))
    } else {
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
    for (let monitor of monitors) {

      let normalized = level
      if (settings.adjustmentTimeIndividualDisplays) {
        // If using individual monitor settings
        normalized = (eventMonitors[monitor.id] >= 0 ? eventMonitors[monitor.id] : level)
      }

      if (settings.remaps) {
        for (let remapName in settings.remaps) {
          if (remapName == monitor.name) {
            let remap = settings.remaps[remapName]
            normalized = normalizeBrightness(normalized, true, remap.min, remap.max)
          }
        }
      }
      if (monitor.brightness < normalized + 3 && monitor.brightness > normalized - 3) {
        updateBrightness(monitor.id, normalized)
        numDone++
      } else {
        updateBrightness(monitor.id, ((monitor.brightness * 2) + normalized) / 3)
      }
      if (numDone === monitors.length) {
        clearInterval(currentTransition);
      }
    }
  }, settings.updateInterval * 1)
}


//
//
//    Get monitor names
//
//

refreshNames = (callback = () => { debug.log("Done refreshing names") }) => {

  wmi.query('SELECT * FROM WmiMonitorID', function (err, result) {
    let out = []
    if (err != null) {
      callback([])
    } else if (result) {
      // Apply names
      for (let monitor of result) {
        let hwid = readInstanceName(monitor.InstanceName)
        if (monitor.UserFriendlyName !== null)
          for (let knownMonitor of monitors) {
            if (knownMonitor.id.split("#")[1] == hwid[1]) {
              knownMonitor.name = parseWMIString(monitor.UserFriendlyName)
              monitorNames[knownMonitor.id] = knownMonitor.name
              break;
            }
          }
      }
      applyRemaps()
      callback(out)
    } else {
      callback([])
    }
  });

}

function parseWMIString(str) {
  let hexed = str.replace('{', '').replace('}', '').replace(/;0/g, ';32')
  var decoded = '';
  var split = hexed.split(';')
  for (var i = 0; (i < split.length); i++)
    decoded += String.fromCharCode(parseInt(split[i], 10));
  decoded = decoded.trim()
  return decoded;
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
  updateBrightness(data.index, data.level)
})

ipcMain.on('request-monitors', function (event, arg) {
  refreshMonitors()
})

ipcMain.on('open-settings', createSettings)


ipcMain.on('open-url', (event, url) => {
  require("electron").shell.openExternal(url)
})

ipcMain.on('get-update', (event, url) => {
  getLatestUpdate(url)
})

ipcMain.on('panel-height', (event, height) => {
  panelSize.height = height
  repositionPanel()
})

ipcMain.on('panel-hidden', () => {
  mainWindow.setAlwaysOnTop(false)
  if (false && settings.killWhenIdle) mainWindow.close()
})

ipcMain.on('sleep-displays', () => { analyticsUsage.UsedSleep++ })



//
//
//    Initialize Panel
//
//

function createPanel(toggleOnLoad = false) {

  mainWindow = new BrowserWindow({
    width: panelSize.width,
    height: panelSize.height,
    x: 0,
    y: 0,
    backgroundColor: "#00000000",
    frame: false,
    show: false,
    alwaysOnTop: true,
    transparent: true,
    skipTaskbar: true,
    resizable: false,
    type: "toolbar",
    maximizable: false,
    minimizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL(
    isDev
      ? "http://localhost:3000/index.html"
      : `file://${path.join(__dirname, "../build/index.html")}`
  );

  mainWindow.on("closed", () => (mainWindow = null));

  mainWindow.webContents.once('dom-ready', () => {
    createTray()
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    repositionPanel()
    if (toggleOnLoad) setTimeout(() => { toggleTray() }, 100);
  })

  mainWindow.on("blur", () => {
    sendToAllWindows("panelBlur")
  })

}

function repositionPanel() {
  let displays = screen.getAllDisplays()
  let primaryDisplay = displays.find((display) => {
    return display.bounds.x == 0 || display.bounds.y == 0
  })

  const taskbar = taskbarPosition()
  sendToAllWindows('taskbar', taskbar)

  if (mainWindow) {
    if (taskbar.position == "LEFT") {
      mainWindow.setBounds({
        width: panelSize.width,
        height: panelSize.height,
        x: taskbar.gap,
        y: primaryDisplay.workArea.height - panelSize.height
      })
    } else if (taskbar.position == "TOP") {
      mainWindow.setBounds({
        width: panelSize.width,
        height: panelSize.height,
        x: primaryDisplay.workArea.width - panelSize.width,
        y: taskbar.gap
      })
    } else {
      mainWindow.setBounds({
        width: panelSize.width,
        height: panelSize.height,
        x: primaryDisplay.workArea.width - panelSize.width,
        y: primaryDisplay.workArea.height - panelSize.height
      })
    }
  }
}


function taskbarPosition() {
  let displays = screen.getAllDisplays()
  let primaryDisplay = displays.find((display) => {
    return display.bounds.x == 0 || display.bounds.y == 0
  })
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
  return { position, gap }
}

app.on("ready", () => {
  readSettings()
  getLocalization()
  applyHotkeys()
  showIntro()
  createPanel()
  addEventListeners()
  checkForUpdates()
})

app.on("window-all-closed", () => {
  //app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) {
    createPanel();
  }

  app.on('quit', () => {
    tray.destroy()
  })

});



//
//
//    Tray
//
//

function createTray() {
  if (tray != null) return false;

  tray = new Tray(path.join(__dirname, 'assets/icon.ico'))
  const contextMenu = Menu.buildFromTemplate([
    { label: T.t("GENERIC_SETTINGS"), type: 'normal', click: createSettings },
    { label: T.t("GENERIC_QUIT"), type: 'normal', click: quitApp }
  ])
  tray.setToolTip('Twinkle Tray' + (isDev ? " (Dev)" : ""))
  tray.setContextMenu(contextMenu)
  tray.on("click", toggleTray)
}

function quitApp() {
  app.quit()
}

function toggleTray() {
  if (mainWindow == null) {
    createPanel(true)
  }
  refreshMonitors()
  getThemeRegistry()
  getSettings()

  // Send accent
  sendToAllWindows('update-colors', getAccentColors())
  if (latestVersion) sendToAllWindows('latest-version', latestVersion);

  if (mainWindow) {
    mainWindow.setBounds({ y: tray.getBounds().y - panelSize.height })
    repositionPanel()
    mainWindow.setAlwaysOnTop(true)
    mainWindow.webContents.send("tray-clicked")
    mainWindow.focus()
    mainWindow.setSkipTaskbar(false)
    mainWindow.setSkipTaskbar(true)
    analyticsUsage.OpenedPanel++
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
      preload: path.join(__dirname, 'intro-preload.js')
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
    frame: false,
    icon: './src/assets/logo.ico',
    backgroundColor: (lastTheme && lastTheme.SystemUsesLightTheme == 1 ? "#FFFFFF" : "#000000"),
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js')
    }
  });

  settingsWindow.loadURL(
    isDev
      ? "http://localhost:3000/settings.html"
      : `file://${path.join(__dirname, "../build/settings.html")}`
  );

  settingsWindow.on("closed", () => (settingsWindow = null));

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show()
    
    // Prevent links from opening in Electron
    settingsWindow.webContents.on('will-navigate', (e, url) => {
      if(url.indexOf("http://localhost:3000") !== 0 || url.indexOf("file://") !== 0) return false;
      e.preventDefault()
      require('electron').shell.openExternal(url)
    })
  })

  analyticsUsage.OpenedSettings++

}



//
//
//    App Updates
//
//



let latestVersion = false
let lastCheck = false
function checkForUpdates() {
  if (!settings.checkForUpdates) return false;
  if (lastCheck && lastCheck == new Date().getDate()) return false;
  lastCheck = new Date().getDate()
  try {
    const fetch = require('node-fetch');
    if (isAppX === false) {
      console.log("Checking for updates...")
      fetch("https://api.github.com/repos/xanderfrangos/twinkle-tray/releases").then((response) => {
        response.json().then((json) => {
          latestVersion = {
            releaseURL: (json[0].html_url),
            version: json[0].tag_name,
            downloadURL: json[0].assets[0]["browser_download_url"],
            show: false
          }
          if ("v" + app.getVersion() != latestVersion.version && settings.dismissedUpdate != latestVersion.version) {
            latestVersion.show = true
          }
        })
      });
    }
  } catch (e) {
    console.log(e)
  }
}


function getLatestUpdate(url) {
  try {
    console.log("Downloading update from: " + url)
    const fs = require('fs');
    const fetch = require('node-fetch');

    // Remove old update
    if (fs.existsSync(updatePath)) {
      try {
        fs.unlink(updatePath)
      } catch (e) {
        console.log("Couldn't delete update file")
      }
    }

    fetch(url)
      .then(res => {
        console.log("Downloaded!")
        try {
          const dest = fs.createWriteStream(updatePath);
          dest.on('finish', function () {
            console.log("Saved! Running...")
            setTimeout(() => {
              try {
                const { spawn } = require('child_process');
                let process = spawn(updatePath, {
                  detached: true,
                  stdio: 'ignore'
                });
                process.unref()
                app.quit()
              } catch (e) {
                console.log(e)
              }
            }, 1250)
          });
          res.body.pipe(dest);
        } catch (e) {
          console.log("Couldn't write update file")
        }
      });
  } catch (e) {
    console.log(e)
  }
}

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

  screen.on('display-added', handleMonitorChange)
  screen.on('display-removed', handleMonitorChange)
  screen.on('display-metrics-changed', repositionPanel)

  if (settings.checkTimeAtStartup) {
    lastTimeEvent = false;
    setTimeout(handleBackgroundUpdate, 500)
  }
  restartBackgroundUpdate()
}

function handleAccentChange() {
  sendToAllWindows('update-colors', getAccentColors())
  getThemeRegistry()
}

function handleMonitorChange(e) {
  refreshMonitors()
}

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
          refreshMonitors().then(() => {
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
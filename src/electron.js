const electron = require("electron");
const path = require('path');
const fs = require('fs')
const { nativeTheme, systemPreferences, Menu, Tray, BrowserWindow, ipcMain, app, screen } = require('electron')
const { exec } = require('child_process');
const isDev = require("electron-is-dev");
const regedit = require('regedit')
const Color = require('color')
const { WindowsStoreAutoLaunch } = require('electron-winstore-auto-launch');

const isAppX = (app.getName() == "twinkle-tray-appx" ? true : false)

// Logging
const logPath = path.join(app.getPath("userData"), `\\debug${(isDev ? "-dev" : "")}.log`)
const updatePath = path.join(app.getPath("userData"), `\\update.exe`)

// Remove old log
if(fs.existsSync(logPath)) {
  fs.unlinkSync(logPath)
}

// Remove old update
if (fs.existsSync(updatePath)) {
  fs.unlinkSync(updatePath)
}

const log = async (...args) => {
  for(let arg of args) {
    console.log(arg, "\r\n")
    fs.appendFile(logPath, arg, () => {})
  }
}

const debug = {
  log,
  error: log
}

const ddcci = require("@hensm/ddcci");
if(isDev) {
  var WmiClient = require('wmi-client');
} else {
  var WmiClient = require(path.join(app.getAppPath(), '../app.asar.unpacked/node_modules/wmi-client'));
}


let monitors = []
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
if(!isDev) regedit.setExternalVBSLocation(path.join(path.dirname(app.getPath('exe')), '.\\resources\\node_modules\\regedit\\vbs'));



//
//
//    Settings init
//
//

if(!fs.existsSync(app.getPath("appData"))) {
  try {
    fs.mkdirSync(app.getPath("appData"), {recursive: true})
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
  remaps: [],
  hotkeys: [],
  adjustmentTimes: [],
  checkTimeAtStartup: false,
  order: [],
  checkForUpdates: !isDev,
  dismissedUpdate: ''
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
  } catch(e) {
    debug.error("Couldn't load settings", e)
  }
  processSettings()
}


function writeSettings(newSettings = {}, processAfter = true) {
  settings = Object.assign(settings, newSettings)

  // Save new settings
  try {
    fs.writeFile(settingsPath, JSON.stringify(settings), (e) => {if(e) debug.error(e)})
  } catch(e) {
    debug.error("Couldn't save settings.", settingsPath, e)
  }
  if (processAfter) processSettings();
}


function processSettings() {
  if (settings.theme) {
    nativeTheme.themeSource = determineTheme(settings.theme)
  }
  updateStartupOption((settings.openAtLogin || false))
  applyOrder()
  if (settings.killWhenIdle && mainWindow && mainWindow.isAlwaysOnTop() === false) {
    mainWindow.close()
  }
  sendToAllWindows('settings-updated', settings)
}

function applyOrder() {
  for(let monitor of monitors) {
    for(let order of settings.order) {
      if(monitor.id == order.id) {
        monitor.order = order.order
      }
    }
  }
}

function determineTheme(themeName) {
  theme = themeName.toLowerCase()
  if(theme === "dark" || theme === "light") return theme;
  if(lastTheme && lastTheme.SystemUsesLightTheme) {
    return "light"
  } else {
    return "dark"
  }
}


async function updateStartupOption(openAtLogin) {
  if(!isDev)
  app.setLoginItemSettings({ openAtLogin })

  // Set autolaunch for AppX
  try {
    if(isAppX) {
      if(openAtLogin) {
        WindowsStoreAutoLaunch.enable()
      } else {
        WindowsStoreAutoLaunch.disable()
      }
    } 
  } catch (e) {
    debug.error(e)
  }
}

function getSettings() {
  processSettings()
  sendToAllWindows('settings-updated', settings)
}


function sendToAllWindows(eventName, data) {
  if(mainWindow) {
    mainWindow.webContents.send(eventName, data)
  }
  if(settingsWindow) {
    settingsWindow.webContents.send(eventName, data)
  }
  if(introWindow) {
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

  if(lastTheme) sendToAllWindows('theme-settings', lastTheme)

  regedit.list('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', function(err, results) {
    try {
      if(err) {
        debug.error("Couldn\'t find theme key.", err)
      } else {

        // We only need the first one, but for some reason this module returns it as an object with a key of the registry key's name. So we have to iterate through the object and just get the first one.
        if(results)
        for(let result in results) {
          let themeSettings = Object.assign(results[result].values, {})

          // We don't need the type, so dump it
          for(let value in themeSettings) {
            themeSettings[value] = themeSettings[value].value
          }

          // Send it off!
          sendToAllWindows('theme-settings', themeSettings)
          lastTheme = themeSettings
          if(tray) {
            tray.setImage((themeSettings.SystemUsesLightTheme ? path.join(__dirname, 'assets/light-theme/icon.ico') : path.join(__dirname, 'assets/icon.ico')))
          }
          break; // Only the first one is needed
        }

      }
    } catch(e) {
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
  if(accent.hsl().color[2] > 60) adjustedAccent = matchLumi(accent, 0.6);
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

  for (monitor of ddcciMonitors) {
    try {
      foundMonitors.push({
        name: `Display ${local + 1}`,
        id: monitor,
        device: monitor.split("#"),
        num: local,
        localID: local,
        brightness: ddcci.getBrightness(monitor),
        type: 'ddcci',
        min: 0,
        max: 100
      })
    } catch {

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
          for (monitor of result) {
            out.push({
              name: `Display ${local + 1}`,
              id: monitor.InstanceName,
              device: monitor.InstanceName,
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
      //mon.num = local
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


function updateBrightness(index, level) {
  const monitor = monitors[index]
  const brightness = Math.round(level * 1)
  try {
    if (monitor.type == "ddcci") {
      // Always use the latest monitors
      const allMonitors = ddcci.getMonitorList()
      ddcci.setBrightness(monitor.id, brightness)
    } else if (monitor.type == "wmi") {
      exec(`powershell.exe (Get-WmiObject -Namespace root\\wmi -Class WmiMonitorBrightnessMethods).wmisetbrightness(0, ${brightness})"`)
    }
    monitor.brightness = brightness
  } catch (e) {
    debug.error("Could not update brightness", e)
  }
}

function normalizeBrightness(level, sending = false, min = 0, max = 100) {
  if(min > 0 || max < 100) {
    let out = level
    if(sending) {
      out = (min + ( ( level / 100) * (max - min) ) )
    } else {
      out = ((level - min) * (100 / (max - min)))
    }
    return Math.round(out)
  } else {
    return level
  } 
}

let currentTransition = null
function transitionBrightness(level) {
  if(currentTransition !== null) clearInterval(currentTransition);
  currentTransition = setInterval(() => {
    let numDone = 0
    for (monitor of monitors) {
      let normalized = level
      if(settings.remaps) {
        for(let remapName in settings.remaps) {
          if(remapName == monitor.name) {
            let remap = settings.remaps[remapName]
            normalized = normalizeBrightness(level, true, remap.min, remap.max)
          }
        }
      }
      if(monitor.brightness < normalized + 3 && monitor.brightness > normalized - 3) {
        updateBrightness(monitor.num, normalized)
        numDone++
      } else {
        updateBrightness(monitor.num, ((monitor.brightness * 2) + normalized) / 3)
      }
      if(numDone === monitors.length) {
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
      for (monitor of result) {
        let hwid = readInstanceName(monitor.InstanceName)
        if (monitor.UserFriendlyName !== null)
        for (knownMonitor of monitors) {
          if (knownMonitor.device[1] == hwid[1]) {
            knownMonitor.name = parseWMIString(monitor.UserFriendlyName)
            knownMonitor.rawName = monitor.UserFriendlyName
            break;
          }
        }
      }
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
  if(settings.killWhenIdle) mainWindow.close()
})



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

}

function repositionPanel() {
  let displays = electron.screen.getAllDisplays()
  let primaryDisplay = displays.find((display) => {
    return display.bounds.x == 0 || display.bounds.y == 0
  })

  const taskbar = taskbarPosition()
  sendToAllWindows('taskbar', taskbar)

  if (mainWindow) {
    if(taskbar.position == "LEFT") {
      mainWindow.setBounds({
        width: panelSize.width,
        height: panelSize.height,
        x: taskbar.gap,
        y: primaryDisplay.workArea.height - panelSize.height
      })
    } else if(taskbar.position == "TOP") {
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
  let displays = electron.screen.getAllDisplays()
  let primaryDisplay = displays.find((display) => {
    return display.bounds.x == 0 || display.bounds.y == 0
  })
  const bounds = primaryDisplay.bounds
  const workArea = primaryDisplay.workArea
  let gap = 0
  let position = "BOTTOM"
  if(bounds.x < workArea.x) {
    position = "LEFT"
    gap = bounds.width - workArea.width
  } else if( bounds.y < workArea.y) {
    position = "TOP"
    gap = bounds.height - workArea.height
  } else if(bounds.width > workArea.width) {
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
  showIntro()
  createPanel()
  addEventListeners()
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
  if(tray != null) return false;

  tray = new Tray(path.join(__dirname, 'assets/icon.ico'))
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Settings', type: 'normal', click: createSettings },
    { label: 'Quit', type: 'normal', click: quitApp }
  ])
  tray.setToolTip('Twinkle Tray' + (isDev ? " (Dev)" : ""))
  tray.setContextMenu(contextMenu)
  tray.on("click", toggleTray)
}

function quitApp() {
  app.quit()
}

function toggleTray() {
  if(mainWindow == null) {
    createPanel(true)
  }
  refreshMonitors()
  getThemeRegistry()
  getSettings()

  // Send accent
  sendToAllWindows('update-colors', getAccentColors())
  if(latestVersion) sendToAllWindows('latest-version', latestVersion);

  if(mainWindow) {
    mainWindow.setBounds({ y: tray.getBounds().y - panelSize.height })
    repositionPanel()
    mainWindow.setAlwaysOnTop(true)
    mainWindow.webContents.send("tray-clicked")
    mainWindow.focus()
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
  if(settings.userClosedIntro) {
    return false;
  }

  if(introWindow != null) {
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
  if(introWindow) {
    introWindow.close()
    writeSettings({userClosedIntro: true})
  }
})






//
//
//    Settings Window
//
//

let settingsWindow
function createSettings() {

  if(settingsWindow != null) {
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
  })

}



//
//
//    App Updates
//
//



let latestVersion = false
let lastCheck = false
function checkForUpdates() {
  if(lastCheck && lastCheck == new Date().getDate()) return false;
  lastCheck = new Date().getDate()
  try {
    const fetch = require('node-fetch');
  if(isAppX === false) {
    console.log("Checking for updates...")
    fetch("https://api.github.com/repos/xanderfrangos/twinkle-tray/releases").then((response) => {
        response.json().then((json) => {
            latestVersion = {
              releaseURL: (json[0].html_url),
              version: json[0].tag_name,
              downloadURL: json[0].assets[0]["browser_download_url"],
              show: false
          }
          if("v" + app.getVersion() != latestVersion.version && settings.dismissedUpdate != latestVersion.version) {
            latestVersion.show = true
          }
        })
    });
}
  } catch(e) {
    console.log(e)
  }
}


function getLatestUpdate(url) {
  try {
    console.log("Downloading update from: " + url)
    const fs = require('fs');
    const fetch = require('node-fetch');

    fetch(url)
      .then(res => {
        console.log("Downloaded!")
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
            } catch(e) {
              console.log(e)
            }
          }, 1250)
        });
        res.body.pipe(dest);
      });

  } catch(e) {
    console.log(e)
  }
}

ipcMain.on('ignore-update', (event, dismissedUpdate) => {
  writeSettings({dismissedUpdate})
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
  
  electron.screen.on('display-added', handleMonitorChange)
  electron.screen.on('display-removed', handleMonitorChange)
  electron.screen.on('display-metrics-changed', handleMonitorChange)

  if (settings.checkTimeAtStartup) {
    lastTimeEvent = false;
    setTimeout(handleBackgroundUpdate, 500)
  }
  backgroundInterval = setInterval(handleBackgroundUpdate, (isDev ? 5000 : 60000 * 1))
}

function handleAccentChange() {
  sendToAllWindows('update-colors', getAccentColors())
  getThemeRegistry()
}

function handleMonitorChange() {
  refreshMonitors()
  repositionPanel()
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
        const eventHour = (event.hour * 1) + (event.am == "PM" && event.hour != 12 ? 12 : 0)
        const eventMinute = event.minute * 1
        // Check if event is not later than current time, last event time, or last found time
        if (hour >= eventHour && (hour > eventHour || minute >= eventMinute) && (foundEvent === false || (foundEvent.hour < eventHour && foundEvent.minute <= eventMinute))) {
          foundEvent = Object.assign({}, event)
          foundEvent.minute = foundEvent.minute * 1
          foundEvent.hour = (foundEvent.hour * 1) + (foundEvent.am == "PM" && foundEvent.hour != 12 ? 12 : 0)
        }
      }
      if (foundEvent) {
        if (lastTimeEvent == false || lastTimeEvent.hour < foundEvent.hour || (lastTimeEvent.hour == foundEvent.hour && lastTimeEvent.minute < foundEvent.minute) ) {
          console.log("Adjusting brightness automatically", foundEvent)
          lastTimeEvent = foundEvent
          lastTimeEvent.day = new Date().getDate()
          transitionBrightness(foundEvent.brightness)
        }
      }
    }
  } catch(e) {
    console.error(e)
  }

  checkForUpdates()
  
}
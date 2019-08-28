const electron = require("electron");
const path = require('path');
const fs = require('fs')
const { systemPreferences, Menu, Tray, BrowserWindow, ipcMain, app } = require('electron')
const { exec } = require('child_process');
const isDev = require("electron-is-dev");
const regedit = require('regedit')
const Color = require('color')
const { WindowsStoreAutoLaunch } = require('electron-winstore-auto-launch');

const isAppX = (app.getName() == "twinkle-tray-appx" ? true : false)


// Logging
const logPath = path.join(app.getPath("userData"), `\\debug${(isDev ? "-dev" : "")}.log`)

// Remove old log
if(fs.existsSync(logPath)) {
  fs.unlinkSync(logPath)
}

const log = async (...args) => {
  for(let arg of args) {
    console.log(arg + "\r\n")
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


// Set up MonitorInfo path
let exePath = (isDev ? path.join(__dirname, 'MonitorInfo.exe') : path.join(__dirname, '../../src/MonitorInfo.exe'))
if(isAppX) {
  // We can't actually run this from the AppX, so we copy it somewhere we can.
  const newPath = path.join(app.getPath("userData"), `\\MonitorInfo.exe`)
  fs.copyFileSync(exePath, newPath)
  exePath = newPath
}




//
//
//    Settings init
//
//

const settingsPath = path.join(app.getPath("userData"), `\\settings${(isDev ? "-dev" : "")}.json`)
let settings = {}

function readSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath))
      
      updateStartupOption((settings.openAtLogin || false))
      
    } else {
      fs.writeFileSync(settingsPath, JSON.stringify({}))
    }
    debug.log('Settings loaded:', settings)
  } catch(e) {
    debug.error("Couldn't load settings", e)
  }
}


function writeSettings(newSettings = {}) {
  settings = Object.assign(settings, newSettings)
  sendToAllWindows('settings-updated', settings)

  updateStartupOption((settings.openAtLogin || false))

  // Save new settings
  try {
    fs.writeFile(settingsPath, JSON.stringify(settings), (e) => {if(e) debug.error(e)})
  } catch(e) {
    debug.error("Couldn't save settings.", settingsPath, e)
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
  sendToAllWindows('settings-updated', settings)
}


function sendToAllWindows(eventName, data) {
  if(mainWindow) {
    mainWindow.webContents.send(eventName, data)
  }
  if(settingsWindow) {
    settingsWindow.webContents.send(eventName, data)
  }
}

ipcMain.on('send-settings', (event, newSettings) => {
  writeSettings(newSettings)
})

ipcMain.on('request-settings', (event) => {
  getThemeRegistry() // Technically, it doesn't belong here, but it's a good place to piggy-back off of
  getSettings()
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
  return {
    accent: accent.hex(),
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
        device: monitor,
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
      mon.num = local
      foundMonitors.push(mon)
      local++
    }
  }

  // Basic info acquired, send it off

  monitors = foundMonitors
  sendToAllWindows('monitors-updated', monitors)

  // Get names

  refreshNames(() => {
    sendToAllWindows('names-updated', monitors)
  })
}

// Get monitor names
refreshNames = (callback = () => { debug.log("Done refreshing names") }) => {
  debug.log(exePath)
  exec(`"${exePath}"`, {}, (error, stdout, stderr) => {
    if (error) {
      debug.log(error);
    }
    debug.log(stdout)
    let split1 = stdout.split(";;")
    let split2 = []
    for (split of split1) {
      split2.push(split.split("||"))
    }

    for (monitor of split2) {
      for (knownMonitor of monitors) {
        if (knownMonitor.id == monitor[0]) {
          knownMonitor.name = monitor[1]
          knownMonitor.device = monitor[2]
          break;
        }
      }
    }
    callback(stdout)
  });
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
  const monitor = monitors[data.index]

  try {
    if (monitor.type == "ddcci") {
      // Always use the latest monitors
      const allMonitors = ddcci.getMonitorList()
      ddcci.setBrightness(monitor.id, data.level * 1)
    } else if (monitor.type == "wmi") {
      exec(`powershell.exe (Get-WmiObject -Namespace root\\wmi -Class WmiMonitorBrightnessMethods).wmisetbrightness(0, ${data.level})"`)
    }
  } catch (e) {
    debug.error("Could not update brightness", e)
  }

})

ipcMain.on('request-monitors', function (event, arg) {
  refreshMonitors()
})

ipcMain.on('open-settings', createSettings)


ipcMain.on('open-url', (event, url) => {
  require("electron").shell.openExternal(url)
})

ipcMain.on('panel-height', (event, height) => {
  panelSize.height = height
  repositionPanel()
})

ipcMain.on('panel-hidden', () => {
  mainWindow.setAlwaysOnTop(false)
})



//
//
//    Initialize Panel
//
//

function createPanel() {

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


app.on("ready", createPanel);
app.on("ready", addEventListeners);

app.on("window-all-closed", () => {
  app.quit();
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
  refreshMonitors()
  getThemeRegistry()
  getSettings()

  // Send accent
  sendToAllWindows('update-colors', getAccentColors())

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
  
  settingsWindow = new BrowserWindow({
    width: 600,
    height: 490,
    minHeight: 450,
    minWidth: 400,
    show: false,
    maximizable: true,
    resizable: true,
    minimizable: true,
    frame: false,
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
//    System event listeners
//
//

function addEventListeners() {
  systemPreferences.on('accent-color-changed', handleAccentChange)
  systemPreferences.on('color-changed', handleAccentChange)
  
  electron.screen.on('display-added', handleMonitorChange)
  electron.screen.on('display-removed', handleMonitorChange)
  electron.screen.on('display-metrics-changed', handleMonitorChange)
}

function handleAccentChange() {
  sendToAllWindows('update-colors', getAccentColors())
  getThemeRegistry()
}

function handleMonitorChange() {
  refreshMonitors()
  repositionPanel()
}


// readSettings
readSettings()
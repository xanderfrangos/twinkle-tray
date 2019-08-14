const electron = require("electron");
const app = electron.app;
const ipc = require('electron').ipcMain
const path = require('path');
const { systemPreferences, Menu, Tray, BrowserWindow } = require('electron')
const { exec } = require('child_process');
const isDev = require("electron-is-dev");

const ddcci = require("@hensm/ddcci");
var WmiClient = require('wmi-client');

let monitors = []
let mainWindow;
let tray = null

var wmi = new WmiClient({
  host: 'localhost',
  namespace: '\\\\root\\WMI'
});



//
//
//    Monitor updates
//
//

refreshMonitors = async () => {

  let foundMonitors = []
  let local = 0

  // First, let's get DDC/CI monitors. They're easy.

  const ddcciMonitors = ddcci.getMonitorList()
  for (monitor of ddcciMonitors) {
    try {
      foundMonitors.push({
        name: `Display ${local + 1}`,
        id: monitor,
        num: local,
        localID: local,
        brightness: ddcci.getBrightness(monitor),
        type: 'ddcci'
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
              num: local,
              localID: local,
              brightness: monitor.CurrentBrightness,
              type: 'wmi'
            })
            local++
          }
          resolve(out)
        } else {
          resolve([])
        }
      });

    } catch (e) {
      console.log(e)
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
  mainWindow.webContents.send('monitors-updated', monitors)

  // Get names

  refreshNames(() => {
    mainWindow.webContents.send('names-updated', monitors)
  })
}

// Get monitor names
refreshNames = (callback = () => { console.log("Done refreshing names") }) => {
  const exePath = (isDev ? path.join(__dirname, 'MonitorInfo.exe') : path.join(__dirname, '../../src/MonitorInfo.exe'))
  exec(exePath, {}, (error, stdout, stderr) => {
    if (error) {
      console.log(error);
    }
    let split1 = stdout.split(";;")
    let split2 = []
    for (split of split1) {
      split2.push(split.split("||"))
    }

    for (monitor of split2) {
      for (knownMonitor of monitors) {
        if (knownMonitor.id == monitor[0]) {
          knownMonitor.name = monitor[1]
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

ipc.on('request-colors', () => {
  mainWindow.webContents.send('update-colors', {
    accent: "#" + systemPreferences.getAccentColor().substr(0, 6),
    darkMode: systemPreferences.isDarkMode()
  })
})


ipc.on('update-brightness', function (event, data) {
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
    console.error("Could not update brightness", e)
  }

})

ipc.on('request-monitors', function (event, arg) {
  refreshMonitors()
})




//
//
//    Initialize
//
//

function createPanel() {

  let displays = electron.screen.getAllDisplays()
  let externalDisplay = displays.find((display) => {
    return display.bounds.x == 0 || display.bounds.y == 0
  })

  mainWindow = new BrowserWindow({
    width: 356,
    height: 230,
    x: externalDisplay.workArea.width - 356,
    y: externalDisplay.workArea.height - 230,
    backgroundColor: "#00000000",
    frame: false,
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
      ? "http://localhost:3000"
      : `file://${path.join(__dirname, "../build/index.html")}`
  );

  mainWindow.on("closed", () => (mainWindow = null));

  createTray()
}


app.on("ready", createPanel);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) {
    createPanel();
  }
});



//
//
//    Tray
//
//

function createTray() {
  tray = new Tray(path.join(__dirname, 'assets/logo.png'))
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Quit', type: 'normal', click: quitApp }
  ])
  tray.setToolTip('Twinkle Tray')
  tray.setContextMenu(contextMenu)
  tray.on("click", toggleTray)
}

function quitApp() {
  app.quit()
}

function toggleTray() {
  refreshMonitors()
  mainWindow.webContents.send("tray-clicked")
  mainWindow.focus()
}
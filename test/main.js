// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron')
const path = require('node:path')
const easing = require('./easingsFunctions.js')


const WindowUtils = require("setwindowpos-binding")

//app.disableHardwareAcceleration();

let mainWindow
let screenWindow

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1356,
    height: 400,
    transparent: false,
    backgroundColor: "#2f2f2f00",
    backgroundMaterial: "mica",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    resizable: false,
    maximizable: false,
    type: "toolbar",
    //titleBarOverlay: { color: "#00000000", symbolColor: "#FF0000" },
    //frame: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      allowRunningInsecureContent: true,
      webSecurity: false
    }
  })

  screenWindow = new BrowserWindow({
    width: 2560,
    height: 1440,
    transparent: true,
    backgroundColor: "#00000000",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    resizable: false,
    maximizable: false,
    //type: "toolbar",
    //titleBarOverlay: { color: "#00000000", symbolColor: "#FF0000" },
    //frame: false,
    show: false
  })

  //screenWindow.setIgnoreMouseEvents(true)

  
  doAnimate()

  // and load the index.html of the app.
  mainWindow.loadFile('index.html')
  mainWindow.show()

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {

nativeTheme.themeSource = 'dark'

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.


ipcMain.on('material', function (event, data) {
  mainWindow.setBackgroundMaterial(data)
  if(data == "none") {
    mainWindow.setBackgroundColor("#000000FF")
  } else {
    mainWindow.setBackgroundColor("#00000000")
  }
})
ipcMain.on('maximize', function (event, data) {
  mainWindow.maximize()
})
ipcMain.on('restore', function (event, data) {
  mainWindow.unmaximize()
})
let startTime = 0
let endTime = 0
let animateInterval
const anim = {
  ease: "easeInCubic",
  duration: 500,
  busy: false,
  start: {
    x: 2190,
    y: 1440
  },
  end: {
    x: 2190,
    y: 976
  },
  cur: {
    x: 0,
    y: 0,
    xI: 0,
    yI: 0,
    xL: 0,
    yL: 0
  }
}
ipcMain.on('animate', doAnimate)
ipcMain.on('parent', makeParent)
ipcMain.on('parent2', makeParent2)
ipcMain.on('create', createParent)

ipcMain.on('bg', bg)

function doAnimate (event, data) {


  const mainWindowHandle = mainWindow.getNativeWindowHandle().readInt32LE(0)
  const screenWindowHandle = screenWindow.getNativeWindowHandle().readInt32LE(0)

  //WindowUtils.setParentWindow(mainWindowHandle, screenWindowHandle)




  startTime = Date.now()
  endTime = startTime + anim.duration

    anim.cur.x = anim.start.x
    anim.cur.y = anim.start.y
    anim.cur.xL = anim.start.x - 1
    anim.cur.yL = anim.start.y - 1

    const curve = new UnitBezier(0.075, 0.82, 0.165, 1);

    anim.busy = false

    const doAnimateStep = () => {
    if(anim.busy) {
      //console.log(`Busy`);
      return;
    }
    anim.busy = true
    const now = Date.now()
    const progressLinear = Math.min(easing.getProgress(startTime, endTime, now), 1)
    const progress = curve.solve(progressLinear, UnitBezier.prototype.epsilon)
    
    anim.cur.x = easing.getEasedValuePerc(anim.start.x, anim.end.x, progress)
    anim.cur.y = easing.getEasedValuePerc(anim.start.y, anim.end.y, progress)
    anim.cur.xI = Math.round(parseInt(anim.cur.x))
    anim.cur.yI = Math.round(parseInt(anim.cur.y))

    if(anim.cur.xL != anim.cur.xI || anim.cur.yL != anim.cur.yI) {
      mainWindow.setPosition(anim.cur.xI, anim.cur.yI)
      //console.log(`${anim.cur.xI},${anim.cur.yI}`)
    }

    anim.cur.xL = anim.cur.xI
    anim.cur.yL = anim.cur.yI
    
    if(progress >= 1) {
      clearInterval(animateInterval)
    }
      anim.busy = false
    
  }

  animateInterval = setInterval(doAnimateStep, 8)
  doAnimateStep()
}


function bg() {
  WindowUtils.setBackdrop(parentHandle, 0, 0, 0)
}


let parentHandle
function createParent() {
  parentHandle = WindowUtils.createWindow(
    0x00000020
    , "STATIC", "Test", 
    0x02000000
  , 0, 0, 2560, 1440)
  makeParent2()
}

function makeParent() {
  mainWindow.setParentWindow(screenWindow)
}

function makeParent2() {
  const mainWindowHandle = mainWindow.getNativeWindowHandle().readInt32LE(0)
  //const screenWindowHandle = screenWindow.getNativeWindowHandle().readInt32LE(0)
  const screenWindowHandle = parentHandle

  //WindowUtils.setWindowRgn(screenWindowHandle, true, 0, 0, 2560, 1440)

  WindowUtils.setParentWindow(screenWindowHandle, 0)

  WindowUtils.setWindowPos(screenWindowHandle, -1, 0, 0, 2560, 1440, 0x0040)
  WindowUtils.setWindowPos(mainWindowHandle, -1, 2000, 1000, 2560, 1440, 0x0040 | 0x0001)

  let GWL_EXSTYLE = WindowUtils.getWindowLong(screenWindowHandle, -20)
  let GWL_STYLE = WindowUtils.getWindowLong(screenWindowHandle, -16)

  GWL_EXSTYLE |= parseInt("0x00080000", 16)
  GWL_EXSTYLE |= parseInt("0x00000008", 16)
  GWL_EXSTYLE |= parseInt("0x00000020", 16)
  GWL_EXSTYLE |= parseInt("0x00010000", 16)

  GWL_EXSTYLE |= parseInt("0x02000000", 16)

  GWL_EXSTYLE |= parseInt("0x00100000", 16)

  //WindowUtils.setWindowLong(screenWindowHandle, -20, GWL_EXSTYLE)

  //GWL_EXSTYLE = WindowUtils.getWindowLong(mainWindowHandle, -20)
  //GWL_EXSTYLE |= parseInt("0x02000000", 16)
  //WindowUtils.setWindowLong(mainWindowHandle, -20, GWL_EXSTYLE)



  WindowUtils.setParentWindow(mainWindowHandle, screenWindowHandle)
}



function l(str) {
  return parseInt(str, 16)
}






function UnitBezier(p1x, p1y, p2x, p2y) {
    // pre-calculate the polynomial coefficients
    // First and last control points are implied to be (0,0) and (1.0, 1.0)
    this.cx = 3.0 * p1x;
    this.bx = 3.0 * (p2x - p1x) - this.cx;
    this.ax = 1.0 - this.cx -this.bx;

    this.cy = 3.0 * p1y;
    this.by = 3.0 * (p2y - p1y) - this.cy;
    this.ay = 1.0 - this.cy - this.by;
}

UnitBezier.prototype.epsilon = 1e-6; // Precision  
UnitBezier.prototype.sampleCurveX = function(t) {
    return ((this.ax * t + this.bx) * t + this.cx) * t;
}
UnitBezier.prototype.sampleCurveY = function (t) {
    return ((this.ay * t + this.by) * t + this.cy) * t;
}
UnitBezier.prototype.sampleCurveDerivativeX = function (t) {
    return (3.0 * this.ax * t + 2.0 * this.bx) * t + this.cx;
}


UnitBezier.prototype.solveCurveX = function (x, epsilon) {
    var t0; 
    var t1;
    var t2;
    var x2;
    var d2;
    var i;

    // First try a few iterations of Newton's method -- normally very fast.
    for (t2 = x, i = 0; i < 8; i++) {
        x2 = this.sampleCurveX(t2) - x;
        if (Math.abs (x2) < epsilon)
            return t2;
        d2 = this.sampleCurveDerivativeX(t2);
        if (Math.abs(d2) < epsilon)
            break;
        t2 = t2 - x2 / d2;
    }

    // No solution found - use bi-section
    t0 = 0.0;
    t1 = 1.0;
    t2 = x;

    if (t2 < t0) return t0;
    if (t2 > t1) return t1;

    while (t0 < t1) {
        x2 = this.sampleCurveX(t2);
        if (Math.abs(x2 - x) < epsilon)
            return t2;
        if (x > x2) t0 = t2;
        else t1 = t2;

        t2 = (t1 - t0) * .5 + t0;
    }

    // Give up
    return t2;
}

// Find new T as a function of Y along curve X
UnitBezier.prototype.solve = function (x, epsilon) {
    return this.sampleCurveY( this.solveCurveX(x, epsilon) );
}
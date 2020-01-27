<p align="center">
  <img src="https://raw.githubusercontent.com/xanderfrangos/twinkle-tray/master/src/assets/logo.png" width="128px" height="128px">
</p>
<h1 align="center">Twinkle Tray</h1>

Twinkle Tray lets you easily manage the brightness levels of multiple monitors. Even though Windows 10 is capable of adjusting the backlight on most monitors, it typically doesn't support external monitors. Windows 10 also lacks any ability to manage the brightness of multiple monitors. This app inserts a new icon into your system tray, where you can click to have instant access to the brightness levels of all compatible monitors. 

<img src="https://raw.githubusercontent.com/xanderfrangos/twinkle-tray/gh-pages/assets/img/twinkle-tray-screenshot.jpg" />

Twinkle Tray uses DDC/CI and WMI to communicate with your monitors. Make sure you have the appropriate option(s) enabled on your monitor so that it can work with Twinkle Tray.

This app was built with [Electron](https://electronjs.org/), [Node.js](https://nodejs.org/), [node-ddcci](https://github.com/hensm/node-ddcci), [wmi-client](https://github.com/R-Vision/wmi-client), and [electron-react-parcel-boilerplate](<https://github.com/kumarryogeshh/electron-react-parcel-boilerplate>).

## Download

**Download the lastest version from [twinkletray.com](https://twinkletray.com/) or the [Releases page](https://github.com/xanderfrangos/twinkle-tray/releases).**

<a href="https://www.microsoft.com/store/apps/9PLJWWSV01LK" target="_blank"><img width="156" src="https://crushee.app/assets/img/ms-store.svg" alt="Get Twinkle Tray from the Microsoft Store"></a>

## Usage

- Download from the [Releases page](https://github.com/xanderfrangos/twinkle-tray/releases) and run the installer EXE.
- Once installation has finished, you should see the Twinkle Tray icon in your system tray. 
- Click the icon to bring up the Adjust Brightness panel. 
- Click away to hide the panel.
- Right-click the system tray icon to quit.

## Build

- Download or clone.
- Run *npm install*.
- Run *npm run build* to build the native modules.
- Run *npm run parcel* and *npm start* (both must run at the same time).

## License

Copyright © 2020 Xander Frangos

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

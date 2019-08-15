<p align="center">
  <img src="https://raw.githubusercontent.com/xanderfrangos/twinkle-tray/master/src/assets/logo.png" width="128px" height="128px">
</p>
<h1 align="center">Twinkle Tray</h1>

Twinkle Tray lets you easily manage the brightness levels on multiple monitors. Even though Windows is capable of adjusting the backlight on most monitors, it typically doesn't support external monitors. Windows also lacks any ability to manage the brightness of multiple monitors. This app inserts a new icon into your system tray, where you can click to have instant access to the brightness levels of all compatible monitors. 

Twinkle Tray uses DDC/CI and WMI to communicate with your monitors. Make sure you have the appropriate option(s) enabled on your monitor so that it can work with Twinkle Tray.

This app was built with [Electron](https://electronjs.org/), [Node.js](https://nodejs.org/), [node-ddcci](https://github.com/hensm/node-ddcci), [wmi-client](https://github.com/R-Vision/wmi-client), and [electron-react-parcel-boilerplate](<https://github.com/kumarryogeshh/electron-react-parcel-boilerplate>).



## Requirements

- **.NET Framework 4.6.1** - Windows 10 machines should have this pre-installed, but you can download it [here](<https://www.microsoft.com/en-us/download/details.aspx?id=49981>) if needed.
- **Windows 10** **(May 2019 Update or newer)** - Windows 7 and 8/8.1 may work, but are untested. If earlier versions work, please let me know so I can update this.



## Usage

- Download from the [Releases page](https://github.com/xanderfrangos/twinkle-tray/releases) and run the installer EXE.
- Once installation has finished, you should see the Twinkle Tray icon in your system tray. 
- Click the icon to bring up the Adjust Brightness panel. 
- Click away to hide the panel.
- Right-click the system tray icon to quit.



## License

Copyright © 2019 Xander Frangos

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

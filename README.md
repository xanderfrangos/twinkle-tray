<p align="center">
  <img src="https://raw.githubusercontent.com/xanderfrangos/twinkle-tray/master/src/assets/logo.png" width="128px" height="128px" alt="Twinkle Tray brightness slider logo">
</p>
<h1 align="center">Twinkle Tray</h1>

<p align="center"><a href="https://github.com/xanderfrangos/twinkle-tray/releases" target="_blank"><img src="https://img.shields.io/github/v/release/xanderfrangos/twinkle-tray" alt="Latest release" /></a> <a href="https://github.com/xanderfrangos/twinkle-tray/releases" target="_blank"><img src="https://img.shields.io/github/downloads/xanderfrangos/twinkle-tray/total" alt="Total downloads" /></a> <a href="https://hosted.weblate.org/projects/twinkle-tray/twinkle-tray/" target="_blank"><img src="https://hosted.weblate.org/widgets/twinkle-tray/-/twinkle-tray/svg-badge.svg" alt="Translations" /></a></p>

Twinkle Tray lets you easily manage the brightness levels of multiple monitors. Even though Windows 10 is capable of adjusting the backlight on most monitors, it typically doesn't support external monitors. Windows 10 also lacks any ability to manage the brightness of multiple monitors. This app inserts a new icon into your system tray, where you can click to have instant access to the brightness levels of all compatible monitors. 

<img src="https://raw.githubusercontent.com/xanderfrangos/twinkle-tray/gh-pages/assets/img/twinkle-tray-screenshot.jpg" alt="Win 10 brightness slider" />

**Features:**
- Adds brightness sliders to the system tray, similar to the built-in Windows 10 volume panel.
- Normalize backlight across different monitors.
- Can automatically change monitor brightness depending on the time of day.
- Seamlessly blends in with Windows 10. Uses your Personalization settings to match your taskbar.
- Starts up with Windows.

This app was built with [Electron](https://electronjs.org/), [Node.js](https://nodejs.org/), [node-ddcci](https://github.com/hensm/node-ddcci), [wmi-client](https://github.com/R-Vision/wmi-client), and [win32-displayconfig](<https://github.com/djsweet/win32-displayconfig>).

## Download

**Download the lastest version from [twinkletray.com](https://twinkletray.com/) or the [Releases page](https://github.com/xanderfrangos/twinkle-tray/releases).**

<a href="https://www.microsoft.com/store/productId/9PLJWWSV01LK" target="_blank"><img width="156" src="https://crushee.app/assets/img/ms-store.svg" alt="Get Twinkle Tray brightness slider from the Microsoft Store"></a>

## Usage

- Download from the [Releases page](https://github.com/xanderfrangos/twinkle-tray/releases) and run the installer EXE.
- Once installation has finished, you should see the Twinkle Tray icon in your system tray. 
- Click the icon to bring up the Adjust Brightness panel. 
- Click away to hide the panel.
- Right-click the system tray icon to quit.

## Compatibility
Twinkle Tray uses DDC/CI and WMI to communicate with your monitors. Most monitors offer DDC/CI compatibility, but it may be off by default. Make sure you have the appropriate option(s) enabled on your monitor so that it can work with Twinkle Tray. Refer to your monitor's user manual for more information.

**Known issues:**
- The AMD Radeon Control Panel can interfere with Twinkle Tray. Ensure "Custom Colors" is not enabled.
- VGA may not be compatible.
- USB/Thunderbolt/Surface docks with HDMI or DisplayPort may not be compatible. 

If some of your monitors are not being detected, please see [this page](https://github.com/xanderfrangos/twinkle-tray/wiki/Display-Detection-&-Support-Issues) for troubleshooting steps.

## Command Line Arguments

Twinkle Tray (v1.13.0+) supports requesting brightness changes from the command line. Twinkle Tray must already be running. One monitor argument and one brightness argument are required. Multiple arguments will override each other.

For example: `"%LocalAppData%\Programs\twinkle-tray\Twinkle Tray.exe" --MonitorNum=1 --Offset=-30` will adjust monitor number 1 by -30 brightness.

### Supported args:

- `--MonitorNum` Select monitor by number. Starts at 1. *Example: `--MonitorNum=2`*
- `--MonitorID` Select monitor by internal ID. Partial or whole matches accepted. *Example: `--MonitorID="UID2353"`*
- `--All` Flag to select all monitors.
- `--Set` Set brightness percentage. *Example: `--Set=95`*
- `--Offset` Adjust brightness percentage. *Example: `--Offset=-20`*
- `--Overlay` Flag to show new brightness levels in the overlay *Example: `--Overlay`*

*This feature is not available on the Windows Store version of Twinkle Tray.*

## Localization
Thanks to [several contributors](https://github.com/xanderfrangos/twinkle-tray/graphs/contributors), Twinkle Tray is localized for multiple languages. If you'd like to create or update a localization, see [this page](https://github.com/xanderfrangos/twinkle-tray/wiki/Localization-files) for details. Special thanks to [Weblate](https://weblate.org/) for allowing free use of their service.

#### Localization progress
<a href="https://hosted.weblate.org/engage/twinkle-tray/?utm_source=widget">
<img src="https://hosted.weblate.org/widgets/twinkle-tray/-/multi-auto.svg" alt="Translation status" />
</a>

## Build
If you wish to run a development build of Twinkly Tray:

- Download or clone.
- Install the build tools for [`node-gyp`](https://github.com/nodejs/node-gyp#installation), if not already installed. You may already have these from installing NodeJS.
- Run `npm install`.
- Run `npm run build` to build an executable or `npm start` to run a development build.

Note: For actual development, it's recommended to run `npm run parcel` and `npm run dev` seperately.

## License

Copyright © 2020 Xander Frangos

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

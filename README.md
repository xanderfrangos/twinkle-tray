<p align="center">
  <img src="https://raw.githubusercontent.com/xanderfrangos/twinkle-tray/master/src/assets/logo.png" width="128px" height="128px" alt="Twinkle Tray brightness slider logo">
</p>
<h1 align="center">Twinkle Tray</h1>

<p align="center"><a href="https://github.com/xanderfrangos/twinkle-tray/releases" target="_blank"><img src="https://img.shields.io/github/v/release/xanderfrangos/twinkle-tray" alt="Latest release" /></a> <a href="https://github.com/xanderfrangos/twinkle-tray/releases" target="_blank"><img src="https://img.shields.io/github/downloads/xanderfrangos/twinkle-tray/total" alt="Total downloads" /></a> <a href="https://hosted.weblate.org/projects/twinkle-tray/twinkle-tray/" target="_blank"><img src="https://hosted.weblate.org/widgets/twinkle-tray/-/twinkle-tray/svg-badge.svg" alt="Translations" /></a></p>

Twinkle Tray enables brightness control on external displays in Windows 10 & 11. Even though Windows is capable of adjusting the backlight on most monitors, it doesn't support external monitors natively. Windows also lacks any options to manage the brightness of multiple displays. This app inserts a new icon into your system tray, where you can click to have instant access to the brightness levels of all compatible displays. 

<img src="https://raw.githubusercontent.com/xanderfrangos/twinkle-tray/gh-pages/assets/img/tt-screenshot-w11.jpg" alt="Win 10 brightness slider" />

## Features
- Adds brightness sliders to the system tray, similar to the built-in Windows volume flyout.
- Seamlessly blends in with Windows 10 and Windows 11. Uses your Personalization settings to match your taskbar.
- Can automatically change monitor brightness depending on the time of day or when idle.
- Bind hotkeys to adjust the brightness of specific or all displays.
- Normalize backlight across different monitors.
- Control DDC/CI features such as contrast.
- Starts up with Windows.

### Design & Personalization

Twinkle Tray will automatically adjust the look and feel to match your Windows version and preferences. Additional options are available to select the Windows version and theme of your choice.

<img src="https://raw.githubusercontent.com/xanderfrangos/twinkle-tray/gh-pages/assets/img/tt-comparison.jpg" alt="Win 11 brightness slider" />

## Download

**Download the lastest version from [twinkletray.com](https://twinkletray.com/) or the [Releases page](https://github.com/xanderfrangos/twinkle-tray/releases).**

<a href="https://www.microsoft.com/store/productId/9PLJWWSV01LK" target="_blank"><img width="156" src="https://crushee.app/assets/img/ms-store.svg" alt="Get Twinkle Tray brightness slider from the Microsoft Store"></a>

## Install via Package Manager

### Windows Package Manager

```powershell
winget install xanderfrangos.twinkletray
```

### Chocolatey (unofficial)

[Chocolatey](https://chocolatey.org/) users can download and install Twinkle Tray from Chocolatey's Community Repository by installing the `twinkle-tray` package:

```powershell
choco install twinkle-tray
```

To upgrade to the latest approved package version, run the following command:

```powershell
choco upgrade twinkle-tray
```

**This package is not maintained at this repository**. Please do not create issues relating to the package here. Instead, go to the [package page](https://community.chocolatey.org/packages/twinkle-tray) and follow the [Package Triage Process](https://docs.chocolatey.org/en-us/community-repository/users/package-triage-process).

### Scoop (unofficial)

[Scoop](https://scoop.sh/) users can download and install Twinkle Tray from Scoop's Extras bucket by installing the `twinkle-tray` package:

```sh
scoop bucket add extras
scoop install extras/twinkle-tray
```

To upgrade to the latest approved package version, run the following command:

```sh
scoop update twinkle-tray
```

**This package is not maintained at this repository**. Please do not create issues relating to the package here. Instead, go to [ScoopInstallers/Extras](https://github.com/ScoopInstaller/Extras) and search for an existing [issue](https://github.com/ScoopInstaller/Extras/issues?q=is%3Aissue+twinkle-tray) or [discussion](https://github.com/ScoopInstaller/Extras/discussions?discussions_q=twinkle-tray) and create a new [issue](https://github.com/ScoopInstaller/Extras/issues/new/choose) or [discussion](https://github.com/ScoopInstaller/Extras/discussions/new/choose) if one does not already exist.

## Usage

- Download from the [Releases page](https://github.com/xanderfrangos/twinkle-tray/releases) and run the installer EXE.
- Once installation has finished, you should see the Twinkle Tray icon in your system tray. 
- Click the icon to bring up the Adjust Brightness flyout. 
- Click away to hide the flyout.
- Right-click the system tray icon to quit.

## Compatibility
Twinkle Tray uses DDC/CI and WMI to communicate with your monitors. Most monitors offer DDC/CI compatibility, but it may be off by default. Make sure you have the appropriate option(s) enabled on your monitor so that it can work with Twinkle Tray. Refer to your monitor's user manual for more information.

**Known issues:**
- The AMD Radeon Control Panel can interfere with Twinkle Tray. Ensure "Custom Colors" is not enabled.
- VGA/DVI may not be compatible.
- USB/Thunderbolt/Surface docks with HDMI or DisplayPort may not be compatible. 
- DDC/CI features such as brightness control and power state may cause certain models of monitors to behave poorly. This applies to any DDC/CI software, not just Twinkle Tray.

If some of your monitors are not being detected, please see [this page](https://github.com/xanderfrangos/twinkle-tray/wiki/Display-Detection-&-Support-Issues) for troubleshooting steps.

## Command Line Arguments

Twinkle Tray (v1.13.0+) supports requesting brightness changes from the command line. Twinkle Tray must already be running. One monitor argument and one brightness argument are required. Multiple arguments will override each other.

For example: `"%LocalAppData%\Programs\twinkle-tray\Twinkle Tray.exe" --MonitorNum=1 --Offset=-30` will adjust monitor number 1 by -30 brightness.

### Supported args:

- `--List` List all displays. *(available in v1.14.0+)*
- `--MonitorNum` Select monitor by number. Starts at 1. *Example: `--MonitorNum=2`*
- `--MonitorID` Select monitor by internal ID. Partial or whole matches accepted. *Example: `--MonitorID="UID2353"`*
- `--All` Flag to select all monitors.
- `--Set` Set brightness percentage. *Example: `--Set=95`*
- `--Offset` Adjust brightness percentage. *Example: `--Offset=-20`*
- `--VCP` Send a specific DDC/CI VCP code and value instead of brightness. The first part is the VCP code (decimal or hexadecimal), and the second is the value. *Example: `--VCP="0xD6:5"`* *(available in v1.14.4+)*
- `--Overlay` Flag to show new brightness levels in the overlay *Example: `--Overlay`*
- `--Panel` Flag to show new brightness levels in the panel *Example: `--Panel`*

*This feature is not available on the Windows Store version of Twinkle Tray.*

## Localization
Thanks to [several contributors](https://github.com/xanderfrangos/twinkle-tray/graphs/contributors), Twinkle Tray is localized for multiple languages. If you'd like to create or update a localization, see [this page](https://github.com/xanderfrangos/twinkle-tray/wiki/Localization-files) for details. Special thanks to [Weblate](https://weblate.org/) for allowing free use of their service.

#### Localization progress
<a href="https://hosted.weblate.org/engage/twinkle-tray/?utm_source=widget">
<img src="https://hosted.weblate.org/widgets/twinkle-tray/-/multi-auto.svg" alt="Translation status" />
</a>

## Build Instructions
If you wish to run a development build of Twinkly Tray:

- Download or clone.
- Install the build tools for [`node-gyp`](https://github.com/nodejs/node-gyp#installation), if not already installed. You may already have these from installing NodeJS.
- Run `npm install`.
- Run `npm run build` to build an executable or `npm start` to run a development build.

*Note: Twinkle Tray must be built on Windows.*

## Special Thanks

Twinkle Tray was built using frameworks & libraries such as [Electron](https://electronjs.org/), [Node.js](https://nodejs.org/), [node-ddcci](https://github.com/hensm/node-ddcci), and [win32-displayconfig](<https://github.com/djsweet/win32-displayconfig>). Thanks to Weblate for allowing free use of their service, along with the many contributors to the localizations of Twinkle Tray. The app would not be nearly as popular without all of your help. And thank you for the many donations, small and large, over the years. 

## License

Copyright © 2020 Xander Frangos

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

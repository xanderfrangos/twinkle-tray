# Node Active Window

[![NPM](https://img.shields.io/npm/v/@paymoapp/active-window)](https://www.npmjs.com/package/@paymoapp/active-window)
[![Typescript](https://img.shields.io/npm/types/@paymoapp/active-window)](https://www.npmjs.com/package/@paymoapp/active-window)
[![N-API](https://raw.githubusercontent.com/nodejs/abi-stable-node/doc/assets/Node-API%20v6%20Badge.svg)](https://github.com/nodejs/node-addon-api)
[![License](https://img.shields.io/github/license/paymoapp/node-active-window)](https://www.gnu.org/licenses/gpl-3.0.txt)

NodeJS library using native modules to get the active window and some metadata (including the application icon) on Windows, MacOS and Linux.

### Table of Contents

<!-- toc -->

- [Getting started](#getting-started)
    - [Installation](#installation)
    - [Native addon](#native-addon)
    - [Example](#example)
- [API](#api)
    - [Data structures](#data-structures)
    - [Functions](#functions)
- [Native libraries](#native-libraries)
  - [Linux (`module/linux`)](#linux-modulelinux)
    - [Data structures](#data-structures-1)
    - [Public functions](#public-functions)
    - [Example](#example-1)
    - [Building](#building)
  - [Windows (`module/windows`)](#windows-modulewindows)
    - [Data structures](#data-structures-2)
    - [Public functions](#public-functions-1)
    - [Example](#example-2)
    - [Building](#building-1)
  - [MacOS (`module/macos`)](#macos-modulemacos)
    - [Data structures](#data-structures-3)
    - [Public functions](#public-functions-2)
    - [Example](#example-3)
    - [Building](#building-2)

<!-- tocstop -->

## Getting started

#### Installation

```bash
npm install --save @paymoapp/active-window
```

#### Native addon

This project uses NodeJS Native Addons to function, so you can use this library in any NodeJS or Electron project, there won't be any problem with bundling and code signing.

The project uses [prebuild](https://github.com/prebuild/prebuild) to supply prebuilt libraries.

The project uses Node-API version 6, you can check [this table](https://nodejs.org/api/n-api.html#node-api-version-matrix) to see which node versions are supported.

If there's a compliant prebuilt binary, it will be downloaded during installation, or it will be built. You can also rebuild it anytime by running `npm run build:gyp`.

The library has native addons for all the three major operating systems: Windows, MacOS and Linux. For Linux, only the X11 windowing system is supported.

#### Example

You can run a demo application by calling `npm run demo`. You can browse it's source code for a detailed example using the watch API in `demo/index.ts`.

```ts
import ActiveWindow from '@paymoapp/active-window';

ActiveWindow.initialize();

if (!ActiveWindow.requestPermissions()) {
	console.log('Error: You need to grant screen recording permission in System Preferences > Security & Privacy > Privacy > Screen Recording');
	process.exit(0);
}

const activeWin = ActiveWindow.getActiveWindow();

console.log('Window title:', activeWin.title);
console.log('Application:', activeWin.application);
console.log('Application path:', activeWin.path);
console.log('Application PID:', activeWin.pid);
console.log('Application icon:', activeWin.icon);
```

## API

#### Data structures

###### 🗃 &nbsp;&nbsp; WindowInfo

```ts
interface WindowInfo {
	title: string;
	application: string;
	path: string;
	pid: number;
	icon: string;
	windows?: {
		isUWPApp: boolean;
		uwpPackage: string;
	};
}
```

This is the only object you will receive when interacting with this library. It contains information about the currently active window:

- `title` - The title of the current window
- `application` - The name of the application. On Windows you should use the `uwpPackage` parameter instead if `isUWPApp` is set to true
- `path` - The path to the application's executable
- `pid` - Process identifier of the application
- `icon` - Base64 encoded string representing the application icon
- `windows` - Object containing Windows platform specific information, undefined on other platforms
- `windows.isUWPApp` - Set to `true` if the active window is owned by an [Universal Windows Platform](https://docs.microsoft.com/en-us/windows/uwp/get-started/universal-application-platform-guide) application
- `windows.uwpPackage` - Contains the package family name of the UWP application

None of the parameters are nullable, even if their value couldn't be fetched, they will be either be set to an empty string (for the string values), -1 (for the numeric values) or false (for the boolean values).

#### Functions

###### 𝑓 &nbsp;&nbsp; getActiveWindow

```ts
interface IActiveWindow {
	getActiveWindow(): WindowInfo
	// ...
}
```

Requests the current foreground window in a synchronous way. It will throw an error if the current window couldn't be fetched (for example there're no focused windows at the moment).

###### 𝑓 &nbsp;&nbsp; subscribe

```ts
interface IActiveWindow {
	subscribe(callback: (windowInfo: WindowInfo | null) => void): number;
	// ...
}
```

Subscribe to changes of the active window. The supplied callback will be called with `null` if there're no focused windows at the moment.

The function returns a number representing the ID of the watch. You should store this value to remove the event listener later on.

###### 𝑓 &nbsp;&nbsp; unsubscribe

```ts
interface IActiveWindow {
	unsubscribe(watchId: number): void;
	// ...
}
```

Remove the event listener associated with the supplied watch ID. Use this to unsubscribe from the active window changed events.

###### 𝑓 &nbsp;&nbsp; initialize

```ts
interface IActiveWindow {
	initialize(opts?: { osxRunLoop: boolean }): void;
	// ...
}
```

On some platforms (Linux) the library needs some initialization to be done. You must call this function before doing anything with the library regardless of the current platform.

If you're not using this library in a GUI application there might be no runloop running for the main thread. In this case you should set the `osxRunLoop` property to true if you want to use subscriptions.

###### 𝑓 &nbsp;&nbsp; requestPermissions

```ts
interface IActiveWindow {
	requestPermissions(): boolean;
	// ...
}
```

On the MacOS platform you need to request screen recording permission to fetch the title of the current window.

The function will return `true` if the permission is granted and `false` if the permission is denied. This is a non-blocking function, so you will only get the momentary status.

You can call this function regardless of the current platform. On unsupported platforms it will simply return `true`.

When the function is called, the user will be presented with a system modal with instructions to grant the permission. You should include these instructions in your application as well, since this is a one-time modal. After the user grants the permission, it is required to relaunch the application for the changes to take effect.

If the user fails to grant the required permissions, the `title` property of the returned `WindowInfo` will be an empty string.

## Native libraries

You can import the each platform dependent library as a standalone C++ / Objective-C++ library. You can find the library itself in the module's `src` directory. The `napi` directory contains the Node-API bindings and the `demo` directory contains a small demo program that can be built using a Makefile.

You can build the demo by navigating to the `module/<platform>/demo` folder and executing `make`. You can run the demo using `make run` and clean the build artifacts using `make clean`.

The demo has 4 running modes:
- _default_: `make run` - in this mode the library is used to fetch the current window details, then there's a 3 second delay after which the current window is fetched again
- _loop_: `make run MODE=loop` - in this mode the library is used the poll the current window in every 3 seconds until SIGINT (Ctrl+C) is received
- _watch_: `make run MODE=watch` - in this mode the library is used to watch the current window and it's title. There's no polling involved in this mode
- _benchmark_: `make run MODE=benchmark` - in this mode the library will fetch the current window details 100.000 times (or 10.000 times on windows) and it will print the total of the consumed CPU seconds while doing so

### Linux (`module/linux`)

#### Data structures

###### 🗃 &nbsp;&nbsp; WindowInfo

```c++
struct WindowInfo {
	std::string title; // UTF8 encoded string of window title. Empty string if couldn't fetch
	std::string application; // UTF8 encoded string of application name. Empty string if couldn't fetch
	std::string path; // UTF8 encoded string of application path. Empty string if couldn't fetch
	int pid; // PID of process. -1 if couldn't fetch
	std::string icon; // base64 encoded PNG icon. Empty string if couldn't fetch
}
```

###### 🗃 &nbsp;&nbsp; watch_t

```c++
typedef unsigned int watch_t;
```

###### 🗃 &nbsp;&nbsp; watch_callback

```c++
typedef std::function<void(WindowInfo*)> watch_callback;
```

#### Public functions

###### 𝑓 &nbsp;&nbsp; Constructor

```c++
ActiveWindow(unsigned int iconCacheSize = 0);
```

If you pass iconCacheSize > 0, then an LRU (least recently used) cache will be instantiated which will cache the fetched icons. This results in about 90% less CPU seconds consumed. You can use the benchmark mode of the demo to test it yourself.

You should pass a cache size suitable for your application. A bigger cache results in a greater memory consumption, but it also reduces the CPU utilization if your user switches across a large set of applications.

###### 𝑓 &nbsp;&nbsp; getActiveWindow

```c++
WindowInfo* getActiveWindow();
```

Returns pointer to WindowInfo containing the gathered information about the current window. The pointer can be `NULL` in the case of an error or if there is no active window (ex: all the windows are minified). You should free up the allocated WindowInfo object using `delete`.

###### 𝑓 &nbsp;&nbsp; buildAppCache

```c++
void buildAppCache();
```

Gathers all the `.desktop` entries available on the system (starting from `~/.local/share/applications` through each `$XDG_DATA_DIRS/applications`) and resolves the icon path for them. This cache is used to get the icon for a given window. If this function is not called, then no icons will be resolved.

###### 𝑓 &nbsp;&nbsp; watchActiveWindow

```c++
watch_t watchActiveWindow(watch_callback cb);
```

Sets up a watch for the active window. If there's a change in the current active window, or the title of the active window, the callback will be fired with the current active window. You don't need to call `getActiveWindow()` in the callback, you can use the supplied parameter.

This method will also start a background watch thread if it's not already running. Please note that the callbacks will be executed on this thread, so you should assure thread safety.

You __MUST NOT__ free up the WindowInfo object received in the parameter. If you need to store the active window you __SHOULD__ make a copy of it, since the WindowInfo object will be freed after calling all the callbacks.

You should save the returned watch ID to unsubscribe later.

###### 𝑓 &nbsp;&nbsp; unwatchActiveWindow

```c++
void unwatchActiveWindow(watch_t watch);
```

Removes the watch associated with the supplied watch ID.

The background watch thread will not be closed, even if there're no more watches left. It will only be closed when the class's destructor is called.

#### Example

See `module/linux/demo/main.cpp` for an example.

```c++
#include <iostream>
#include "ActiveWindow.h"

using namespace std;
using namespace PaymoActiveWindow;

int main() {
	ActiveWindow* activeWindow = new ActiveWindow(10);

	WindowInfo* windowInfo = activeWindow->getActiveWindow();

	if (windowInfo == NULL) {
		cout<<"Could not get active window\n";
	}
	else {
		cout<<"Title: "<<windowInfo->title<<"\n";
		cout<<"Application: "<<windowInfo->application<<"\n";
		cout<<"Executable path: "<<windowInfo->path<<"\n";
		cout<<"PID: "<<windowInfo->pid<<"\n";
		cout<<"Icon: "<<windowInfo->icon<<"\n";
	}

	delete windowInfo;
	delete activeWindow;

	return 0;
}
```

#### Building

See `module/linux/demo/Makefile` for a sample makefile. You need to check the `lib` target.

You should use C++17 for building and you need to link the following libraries:
- X11 (`-lX11`) - libx11-dev
- PThread (`-lpthread`) - libpthread-stubs0-dev

### Windows (`module/windows`)

#### Data structures

###### 🗃 &nbsp;&nbsp; WindowInfo

```c++
struct WindowInfo {
	std::wstring title = L""; // UTF16 encoded string of window title. Empty string if couldn't fetch
	std::wstring application = L""; // UTF16 encoded string of application. Empty string if couldn't fetch
	std::wstring path = L""; // UTF16 encoded string of executable path. Empty string if couldn't fetch
	unsigned int pid = 0; // Process PID
	bool isUWPApp = false; // if application is detected to be an Universal Windows Platform application
	std::wstring uwpPackage = L""; // UTF16 encoded string of the UWP package name. Empty string if couldn't fetch
	std::string icon = ""; // base64 encoded icon. Empty string if couldn't fetch
};
```

###### 🗃 &nbsp;&nbsp; watch_t

```c++
typedef unsigned int watch_t;
```

###### 🗃 &nbsp;&nbsp; watch_callback

```c++
typedef std::function<void(WindowInfo*)> watch_callback;
```

#### Public functions

###### 𝑓 &nbsp;&nbsp; Constructor

```c++
ActiveWindow(unsigned int iconCacheSize = 0);
```

If you pass iconCacheSize > 0, then an LRU (least recently used) cache will be instantiated which will cache the fetched icons. This results in about 90% less CPU seconds consumed. You can use the benchmark mode of the demo to test it yourself.

You should pass a cache size suitable for your application. A bigger cache results in a greater memory consumption, but it also reduces the CPU utilization if your user switches across a large set of applications.

###### 𝑓 &nbsp;&nbsp; getActiveWindow

```c++
WindowInfo* getActiveWindow();
```

Returns pointer to WindowInfo containing the gathered information about the current window. The pointer can be `NULL` in the case of an error or if there is no active window (ex: all the windows are minified or the desktop is selected). You should free up the allocated WindowInfo object using `delete`.

###### 𝑓 &nbsp;&nbsp; watchActiveWindow

```c++
watch_t watchActiveWindow(watch_callback cb);
```

Sets up a watch for the active window. If there's a change in the current active window, or the title of the active window, the callback will be fired with the current active window. You don't need to call `getActiveWindow()` in the callback, you can use the supplied parameter.

This method will also start a background watch thread if it's not already running. Please note that the callbacks will be executed on this thread, so you should assure thread safety.

You __MUST NOT__ free up the WindowInfo object received in the parameter. If you need to store the active window you __SHOULD__ make a copy of it, since the WindowInfo object will be freed after calling all the callbacks.

You should save the returned watch ID to unsubscribe later.

###### 𝑓 &nbsp;&nbsp; unwatchActiveWindow

```c++
void unwatchActiveWindow(watch_t watch);
```

Removes the watch associated with the supplied watch ID.

The background watch thread will not be closed, even if there're no more watches left. It will only be closed when the class's destructor is called.

#### Example

See `module/windows/demo/main.cpp` for an example.

```c++
#include <iostream>
#include "ActiveWindow.h"

using namespace std;
using namespace PaymoActiveWindow;

int main() {
	ActiveWindow* activeWindow = new ActiveWindow(10);

	WindowInfo* windowInfo = activeWindow->getActiveWindow();

	if (windowInfo == NULL) {
		cout<<"Could not get active window\n";
	}
	else {
		wcout<<L"Title: "<<windowInfo->title<<"\n";
		wcout<<L"Application: "<<windowInfo->application<<"\n";
		wcout<<L"Executable path: "<<windowInfo->path<<"\n";
		cout<<"PID: "<<windowInfo->pid<<"\n";
		cout<<"Is UWP application: "<<(windowInfo->isUWPApp ? "Yes" : "No")<<"\n";
		if (windowInfo->isUWPApp) {
			wcout<<"UWP package name: "<<windowInfo->uwpPackage<<"\n";
		}
		cout<<"Icon: "<<windowInfo->icon<<"\n";
	}

	delete windowInfo;
	delete activeWindow;

	return 0;
}
```

#### Building

See `module/windows/demo/Makefile` for a sample makefile. You need to check the `lib` target. This is not a GNU makefile, it should be used with Microsoft's NMAKE.

To prepare your environment, you need run the `vcvarsall.bat` batch script. If you checked the _install windows build tools_ box during the installation of NodeJS, you should find this file in the following location: `C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvarsall.bat`. So to gain access to the `nmake`, `cl` and `link` commands, execute this:

```batch
"C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
```

You should use C++17 for building and you need to link the following libraries:
- User32.lib
- Shell32.lib
- Version.lib
- Shlwapi.lib
- Gdi32.lib
- Gdiplus.lib
- Windowsapp.lib

### MacOS (`module/macos`)

#### Data structures

###### 🗃 &nbsp;&nbsp; WindowInfo

```c++
struct WindowInfo {
	std::string title; // UTF8 encoded string of window title. Empty string if couldn't fetch
	std::string application; // UTF8 encoded string of application name
	std::string path; // UTF8 encoded string of application path
	int pid; // PID of process
	std::string icon; // base64 encoded PNG icon
}
```

###### 🗃 &nbsp;&nbsp; watch_t

```c++
typedef unsigned int watch_t;
```

###### 🗃 &nbsp;&nbsp; watch_callback

```c++
typedef std::function<void(WindowInfo*)> watch_callback;
```

#### Public functions

###### 𝑓 &nbsp;&nbsp; Constructor

```c++
ActiveWindow(unsigned int iconCacheSize = 0);
```

If you pass iconCacheSize > 0, then an LRU (least recently used) cache will be instantiated which will cache the fetched icons. This results in about 40% less CPU seconds consumed. You can use the benchmark mode of the demo to test it yourself.

You should pass a cache size suitable for your application. A bigger cache results in a greater memory consumption, but it also reduces the CPU utilization if your user switches across a large set of applications.

###### 𝑓 &nbsp;&nbsp; getActiveWindow

```c++
WindowInfo* getActiveWindow();
```

Returns pointer to WindowInfo containing the gathered information about the current window. The pointer can be `NULL` in the case of an error or if there is no active window (ex: all the windows are minified). You should free up the allocated WindowInfo object using `delete`.

###### 𝑓 &nbsp;&nbsp; requestScreenCaptureAccess

```c++
bool requestScreenCaptureAccess();
```

To access the title of the window the process requires the screen capture permission. To check it and request it you need to call this function. This function is non-blocking and will immediately return with the current status (false - permission denied, true - permission granted).

The first time this function is called there will be a system popup instructing the user how he can grant this permission, but you should also include this information in your application, since it's a one-time popup that closes when you click outside of it.

The application needs to be relaunched after granting the permission.

###### 𝑓 &nbsp;&nbsp; watchActiveWindow

```c++
watch_t watchActiveWindow(watch_callback cb);
```

Sets up a watch for the active window. If there's a change in the current active window, the callback will be fired with the current active window. You don't need to call `getActiveWindow()` in the callback, you can use the supplied parameter.

This method will use the observer set up on the main thread to listen to the events, so the main thread has to have a running NSRunLoop. If you integrate this library into a desktop application, then this should already be resolved. Otherwise (for example when using a console application), you have to manually run the RunLoop or call the `runLoop()` helper function which will block for 0.1ms.

If you want to use the watch function, you __MUST__ use this library on the main thread, since the NSWorkspace notifications are only serviced on that thread.

The callbacks are also executed on the main thread, so you shouldn't do anything blocking in them.

You should save the returned watch ID to unsubscribe later.

###### 𝑓 &nbsp;&nbsp; unwatchActiveWindow

```c++
void unwatchActiveWindow(watch_t watch);
```

Removes the watch associated with the supplied watch ID.

###### 𝑓 &nbsp;&nbsp; runLoop

```c++
void runLoop();
```

A helper function which will run the thread's RunLoop for 0.1ms or until the first event is handled. This function should be called on the main thread.

You should only use this function only if you don't have a running RunLoop on your main thread.

#### Example

See `module/macos/demo/main.mm` for an example.

```c++
#include <iostream>
#include "ActiveWindow.h"

using namespace std;
using namespace PaymoActiveWindow;

int main() {
	ActiveWindow* activeWindow = new ActiveWindow();

	WindowInfo* windowInfo = activeWindow->getActiveWindow();

	if (windowInfo == NULL) {
		cout<<"Could not get active window\n";
	}
	else {
		cout<<"Title: "<<windowInfo->title<<"\n";
		cout<<"Application: "<<windowInfo->application<<"\n";
		cout<<"Executable path: "<<windowInfo->path<<"\n";
		cout<<"PID: "<<windowInfo->pid<<"\n";
		cout<<"Icon: "<<windowInfo->icon<<"\n";
	}

	delete windowInfo;
	delete activeWindow;

	return 0;
}
```

#### Building

See `module/macos/demo/Makefile` for a sample makefile. You need to check the `lib` target.

You should use C++17 for building and you need to link the following libraries:
- `-lc++`
- `-framework Foundation`
- `-framework AppKit`
- `-framework ApplicationServices`

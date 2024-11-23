# win32-displayconfig

Simplified Node bindings to the Win32 [Display Device Reference API](https://docs.microsoft.com/en-us/windows/win32/api/_display/).

## Supported Windows Versions

This module has currently only received testing on Windows 10 version 2004.
Additional testing on other versions of Windows 10 and Windows 8.1 would be appreciated.

We are not planning on supporting Windows 7 or Windows 8, as they are generally unsupported
by Microsoft. However, patches to support Windows 7 or Windows 8 are welcome.

## Supported Node Versions

This module requires N-API Version 4,
[bounding the minimum supported Node versions](https://nodejs.org/api/n-api.html#n_api_n_api_version_matrix)
to 8.16.0 (without any support for Node 9), Node 10.16.0, and Node 11.8.0. We are only actively testing
on Node 10.21 and above. We'll note incompatibilities and accept patches for Node 8 if the need arises.

## Functionality

- Querying display devices, at a low and higher
- Observing display device layout and output changes
- Querying the vertical refresh rate at a given display point
- Saving and restoring layouts via the Display Device Reference API

## Examples

### Querying Low-Level Display Device Information

The `queryDisplayConfig` function returns data somewhat similar to the outputs of the
[`QueryDisplayConfig` function](https://docs.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-querydisplayconfig)
via the `pathArray` and `modeInfoArray` properties, and naming and manufacturer info via its
`nameArray` properties.

From [`scripts/dumpquery.js`](scripts/dumpquery.js):

```javascript
const w32disp = require("win32-displayconfig");
const util = require("util");

w32disp.queryDisplayConfig().then((config) => {
  // The outputs of `pathArray` and `modeArray` refer to
  // both parsed values and raw buffer values. The raw buffers
  // are the exact structs returned by the Win32 API, and are
  // used to save and restore display positioning configuration.
  const pathArray = config.pathArray.map((pa) => pa.value);
  const modeArray = config.modeArray.map((ma) => ma.value);
  console.log(
    util.inspect(
      // However, the `nameArray` only refers to parsed values.
      { pathArray, modeArray, nameArray: config.nameArray },
      { depth: 10 }
    )
  );
});
```

Which outputs:

```
{ pathArray:
   [ { flags: 1,
       sourceInfo:
        { adapterId: { LowPart: 945385802, HighPart: 0 },
          id: 0,
          statusFlags: 1,
          modeInfoIdx: 1 },
       targetInfo:
        { adapterId: { LowPart: 945385802, HighPart: 0 },
          id: 114948,
          statusFlags: 1,
          outputTechnology: 'dvi',
          rotation: 0,
          scaling: 'identity',
          refreshRate: { Numerator: 60000, Denominator: 1000 },
          scanLineOrdering: 'progressive',
          targetAvailable: 1,
          modeInfoIdx: 0 } },
     ...
   ],
  modeArray:
   [ { infoType: 'target',
       id: 114948,
       adapterId: { LowPart: 945385802, HighPart: 0 },
       targetMode:
        { targetVideoSignalInfo:
           { pixelRate: { lowPart: 148500000, highPart: 0 },
             hSyncFreq: { Numerator: 148500000, Denominator: 2200 },
             vSyncFreq: { Numerator: 60000, Denominator: 1000 },
             activeSize: { cx: 1920, cy: 1080 },
             totalSize: { cx: 2200, cy: 1125 },
             videoStandard: 255,
             scanlineOrdering: 'progressive' } } },
     ...
   ],
  nameArray:
   [ { adapterId: { LowPart: 945385802, HighPart: 0 },
       id: 114948,
       deviceFlags: 5,
       outputTechnology: 'dvi',
       edidManufactureId: 29188,
       edidProductCodeId: 147,
       connectorInstance: 2,
       monitorFriendlyDeviceName: 'Acer X233H',
       monitorDevicePath:
        '\\\\?\\DISPLAY#ACR0093#5&326e05e0&0&UID114948#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}' },
     ...
   ] }
```

This is generally lower-level output than you want. Consider using `extractDisplayConfig` instead.

### Querying Higher-Level Display Device Information

The `extractDisplayConfig` function reshapes the output of `queryDisplayConfig` to be more useful
to application programmers. Information from the `pathArray`, `modeInfoArray`, and `nameArray` properties
of the output of `queryDisplayConfig` are all joined according to their IDs.

From [`scripts/dumpextract.js`](scripts/dumpextract.js):

```javascript
const w32disp = require("win32-displayconfig");
const util = require("util");

w32disp.extractDisplayConfig().then((output) => {
  console.log(util.inspect(output, { depth: 10 }));
});
```

Which outputs:

```
[ { displayName: 'Acer X233H',
    devicePath:
     '\\\\?\\DISPLAY#ACR0093#5&326e05e0&0&UID114948#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}',
    sourceConfigId: { adapterId: { LowPart: 945385802, HighPart: 0 }, id: 1 },
    targetConfigId:
     { adapterId: { LowPart: 945385802, HighPart: 0 }, id: 114948 },
    inUse: false,
    outputTechnology: 'dvi',
    rotation: 0,
    scaling: 'preferred',
    sourceMode:
     { width: 1920,
       height: 1080,
       pixelFormat: 32,
       position: { x: 0, y: 0 } },
    pathBuffer:
     <Buffer ... >,
    sourceModeBuffer:
     <Buffer ... >,
    targetVideoSignalInfo:
     { pixelRate: { lowPart: 148500000, highPart: 0 },
       hSyncFreq: { Numerator: 148500000, Denominator: 2200 },
       vSyncFreq: { Numerator: 60000, Denominator: 1000 },
       activeSize: { cx: 1920, cy: 1080 },
       totalSize: { cx: 2200, cy: 1125 },
       videoStandard: 255,
       scanlineOrdering: 'progressive' },
    targetModeBuffer:
     <Buffer ... > },
  ...
]
```

Note that the low-level buffers are still present, but `sourceMode`, `targetVideoSignalInfo`, `devicePath`,
and `displayName` have all been combined from multiple sources. Also note the `inUse` boolean, which is
derived from comparing against low-level flags in the Display Device Reference API.

You will likely see multiple outputs for a single display device in this output, with only one of them
having `inUse: true`. The `inUse: false` entries correspond to alternative output modes available on the device.

### Observing Display Device Layout and Output Changes

The display geometry can change at any time during the execution of your program, but sometimes you
depend on knowledge of this geometry for the correct behavior. You can observe changes as they
occur using the `addDisplayChangeListener` function:

```javascript
const w32disp = require("win32-displayconfig");
const listener1 = (err, conf) => {
  if (err !== null) {
    // Report error
    console.error(err);
  } else {
    // conf is the same as the output of extractDisplayConfig
    // ...
  }
};
w32disp.addDisplayChangeListener(listener1);

// Or equivalently
const listener2 = w32disp.addDisplayChangeListener((err, conf) => {
  if (err !== null) {
    console.error(err);
  } else {
    // ...
  }
});
```

Adding these change listeners keeps the event loop active, even when all other
activities have been stopped, so for situations where graceful shutdown is required,
remove all of the listeners using the `removeDisplayChangeListener` function:

```javascript
w32disp.removeDisplayChangeListener(listener1);
w32disp.removeDisplayChangeListener(listener2);
// No more display config activities are present on the event loop,
// so Node can now exit cleanly.
```

### Querying the Vertical Refresh Rate at a Display Point

Some operations need to only occur as quickly as the vertical refresh rate
for smooth performance. For example, many Windows positioning APIs cannot
perform well if they are invoked any faster than the frame rate of the GPU.

This module provides a `VerticalRefreshRateContext` class to determine the
refresh rate of the displays servicing a given display point. Note that not
all displays will necessarily have the same refresh rate, and many displays
can be servicing the same display point. When multiple displays are servicing
the same display point, the result is the minimum vertical refresh rate.

```javascript
const { VerticalRefreshRateContext } = require("win32-displayconfig");
const ctx = new VerticalRefreshRateContext();

async function refreshRateForPoint(x, y) {
  // Here, x is the vertical offset and y is the horizontal offset.
  // These offsets are relative to the upper left hand corner of the
  // primary display, so they are allowed and expected to become negative.
  //
  // The result is either a number indicating the vertical refresh rate in Hz,
  // or undefined if the given point is not present in the display bounds of
  // the current display configuration.
  return await ctx.findVerticalRefreshRateForDisplayPoint(x, y);
}

// ...

// This context reacts to underlying display changes, as a trade-off between
// performance and accuracy. It does so using the `addDisplayChangeListener`
// capabilities, so it needs to be disposed of properly to clear the event
// loop for graceful shutdown.
//
// Call this when you are finished with the context. A good place to do so
// is in the code that handles gracefully exiting your program.
ctx.close();
```

See [`scripts/watchmouse.js`](scripts/watchmouse.js) for a working example, polling
for the refresh rate based on the mouse cursor position.

### Saving and Restoring Device Layouts

This module can save and restore display device layouts (although it cannot directly modify
them yet; patches welcome!). You can use this to implement a display configuration profile
system.

Saving a profile is achieved with the `displayConfigForRestoration` function:

```javascript
const w32disp = require("win32-displayconfig");

async function saveDisplayConfig() {
  const conf = await w32disp.displayConfigForRestoration();
  // The type of conf is JSON-safe: you can store this on the disk,
  // transmit it over a network, etc.
  return JSON.stringify(conf);
}
```

And restoring a profile is achieved with the `restoreDisplayConfig` function:

```javascript
const w32disp = require("win32-displayconfig");

async function restoreDisplayConfig(serialized, persistent) {
  // If "persistent", then this display configuration will be saved in Windows
  // as the default display configuration. This means that restoring to defaults
  // or rebooting will result in this exact configuration.
  persistent = !!persistent;
  const conf = JSON.parse(serialized);

  // If portions of the configuration refer to displays that are not actually
  // present, we make a best effort to enable all of the displays that are both
  // present and enabled in this configuration, and disable all other displays.
  //
  // Otherwise, the display configuration is set exactly.
  await w32disp.restoreDisplayConfig(conf);
}
```

## Copyright

This module is available under the terms of the MIT license. See the [`COPYRIGHT`](COPYRIGHT) file
for more information.

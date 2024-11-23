/*
 * index.js: part of the "win32-displayconfig" Node package.
 * See the COPYRIGHT file at the top-level directory of this distribution.
 */
"use strict";
const addon = require("bindings")("./win32_displayconfig");

/**
 * Represents a numeric error code returned from the Win32 API.
 *
 * @member {number} code is the exact numeric code returned by the Win32 API.
 */
class Win32Error extends Error {
  constructor(code) {
    super(`Win32 error code ${code}`);
    this.code = code;
  }
}

module.exports.Win32Error = Win32Error;

/**
 * @typedef AdapterId
 * @type {object}
 * @property {number} LowPart
 * @property {number} HighPart
 */

/**
 * @typedef DisplayConfigFractional
 * @type {object}
 * @property {number} Numerator
 * @property {number} Denominator
 */

/**
 * @typedef SourcePathInfo
 * @type {object}
 * @property {AdapterId} adapterId
 * @property {number} id
 * @property {number} statusFlags
 * @property {number} modeInfoIdx
 */

/**
 * @typedef TargetPathInfo
 * @type {object}
 * @property {AdapterId} adapterId
 * @property {number} id
 * @property {number} statusFlags
 * @property {string} outputTechnology
 * @property {number} rotation
 * @property {string} scaling
 * @property {DisplayConfigFractional} refreshRate
 * @property {string} scanlineOrdering
 * @property {number} targetAvailable
 * @property {number} modeInfoIdx
 */

/**
 * @typedef PathInfoValue
 * @type {object}
 * @property {number} flags
 * @property {SourcePathInfo} sourceInfo
 * @property {TargetPathInfo} targetInfo
 */

/**
 * @typedef PathInfo
 * @type {object}
 * @property {PathInfoValue} value
 * @property {Buffer} buffer
 */

/**
 * @typedef DisplayConfigPosition
 * @type {object}
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef SourceMode
 * @type {object}
 * @property {number} width
 * @property {number} height
 * @property {number} pixelFormat
 * @property {DisplayConfigPosition} position
 */

/**
 * @typedef SourceModeInfo
 * @type {object}
 * @property {AdapterId} adapterId
 * @property {number} id
 * @property {"source"} infoType
 * @property {SourceMode} sourceMode
 */

/**
 * @typedef PixelRate
 * @type {object}
 * @property {number} lowPart
 * @property {number} highPart
 */

/**
 * @typedef DisplayConfigSize
 * @type {object}
 * @property {number} cx
 * @property {number} cy
 */

/**
 * @typedef TargetVideoSignalInfo
 * @type {object}
 * @property {PixelRate} pixelRate
 * @property {DisplayConfigFractional} hSyncFreq
 * @property {DisplayConfigFractional} vSyncFreq
 * @property {DisplayConfigSize} activeSize
 * @property {DisplayConfigSize} totalSize
 * @property {number} videoStandard
 * @property {string} scanlineOrdering
 */

/**
 * @typedef TargetMode
 * @type {object}
 * @property {TargetVideoSignalInfo} targetVideoSignalInfo
 */

/**
 * @typedef TargetModeInfo
 * @type {object}
 * @property {AdapterId} adapterId
 * @property {number} id
 * @property {"target"} infoType
 * @property {TargetMode} targetMode
 */

/**
 * @typedef ModeInfoValue
 * @type {SourceModeInfo | TargetModeInfo}
 */

/**
 * @typedef ModeInfo
 * @type {object}
 * @property {ModeInfoValue} value
 * @property {Buffer} buffer
 */

/**
 * @typedef NameInfo
 * @type {object}
 * @property {AdapterId} adapterId
 * @property {number} id
 * @property {string} outputTechnology
 * @property {number} edidManufactureId
 * @property {number} edidProductCodeId
 * @property {number} connectorInstance
 * @property {string} monitorFriendlyDeviceName
 * @property {string} monitorDevicePath
 */

/**
 * @typedef QueryDisplayConfigResults
 * @type {object}
 * @property {PathInfo[]} pathArray
 * @property {ModeInfo[]} modeInfoArray
 * @property {NameInfo[]} nameArray
 */

/**
 * Retrieves low-level information from the Win32 API QueryDisplayConfig.
 *
 * The output of this function somewhat matches the "output" values of
 * QueryDisplayConfig, as documented at
 * https://docs.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-querydisplayconfig,
 * in the pathArray and modeInfoArray results.
 *
 * Additionally, this function uses the DisplayConfigGetDeviceInfo function over
 * all resolved displays to return the names, output technology, and manufacturer IDs
 * in the nameArray results.
 *
 * @returns {Promise<QueryDisplayConfigResults>}
 *   A Promise, resolving to { pathArray: [...], modeInfoArray: [...], nameArray: [...] },
 *   or rejecting with a {@link Win32Error} if something goes wrong.
 */
module.exports.queryDisplayConfig = () => {
  return new Promise((resolve, reject) => {
    const ran = addon.win32_queryDisplayConfig((err, result) => {
      if (err !== null) {
        reject(new Win32Error(err));
      } else {
        resolve(result);
      }
    });
    if (!ran) {
      resolve(undefined);
    }
  });
};

/**
 * @typedef ConfigId
 * @type {object}
 * @property {AdapterId} adapterId
 * @property {number} id
 */

/**
 * @typedef ExtractedDisplayConfig
 * @type {object}
 * @property {string} displayName The "friendly name" of the relevant display
 * @property {string} devicePath The Windows NT device path of the relevant display
 * @property {ConfigId} sourceConfigId
 * @property {ConfigId} targetConfigId
 * @property {boolean} inUse Whether this configuration is currently being used
 * @property {string} outputTechnology
 * @property {number} rotation
 * @property {string} scaling
 * @property {SourceMode} sourceMode
 * @property {TargetVideoSignalInfo | undefined} targetVideoSignalInfo
 * @property {Buffer} pathBuffer A Buffer containing the exact DISPLAYCONFIG_PATH_INFO struct
 *  returned by QueryDisplayConfig for this configuration
 * @property {Buffer} sourceModeBuffer A Buffer containing the exact DISPLAYCONFIG_MODE_INFO
 *  source struct returned by QueryDisplayConfig for this configuration
 * @property {Buffer | undefined} targetModeBuffer A Buffer containing the exact DISPLAYCONFIG_MODE_INFO
 *  target struct returned by QueryDisplayConfig for this configuration
 */

/**
 * Retrieves higher-level information from the Win32 API QueryDisplayConfig.
 *
 * Unlike {@link queryDisplayConfig}, this function pulls all relevant information
 * about a device/mode pairing into a single object.
 *
 * @returns {Promise<ExtractedDisplayConfig>} A Promise, resolving to display configuration information
 *   or rejecting with a {@link Win32Error} if something goes wrong.
 */
module.exports.extractDisplayConfig = async () => {
  const config = await module.exports.queryDisplayConfig();
  const ret = [];
  for (const { value, buffer: pathBuffer } of config.pathArray) {
    let inUse = value.flags & (1 === 1) ? true : false;
    const { sourceInfo, targetInfo } = value;

    const {
      modeInfoIdx: sourceModeIdx,
      adapterId: sourceAdapterId,
      id: sourceId,
    } = sourceInfo;
    const {
      adapterId,
      id,
      outputTechnology,
      rotation,
      scaling,
      modeInfoIdx: targetModeIdx,
    } = targetInfo;

    const sourceConfigId = {
      adapterId: sourceAdapterId,
      id: sourceId,
    };
    const targetConfigId = {
      adapterId,
      id,
    };

    const displayNameEntry = config.nameArray.find(
      (n) =>
        n.adapterId.LowPart === adapterId.LowPart &&
        n.adapterId.HighPart === adapterId.HighPart &&
        n.id === id &&
        n.outputTechnology &&
        outputTechnology &&
        n.monitorDevicePath.length > 0
    );

    if (displayNameEntry === undefined) {
      continue;
    }

    const sourceMode = config.modeArray[sourceModeIdx];
    const targetMode = config.modeArray[targetModeIdx];
    if (sourceMode === undefined) {
      continue;
    }
    if (targetMode === undefined) {
      // When we can't find the target mode, but _can_
      // find the source mode, that just means the monitor is off.
      inUse = false;
    }

    const sourceModeValue = sourceMode.value;
    if (sourceModeValue.infoType !== "source") {
      continue;
    }

    const { monitorFriendlyDeviceName, monitorDevicePath } = displayNameEntry;
    const output = {
      displayName: monitorFriendlyDeviceName,
      devicePath: monitorDevicePath,
      sourceConfigId,
      targetConfigId,
      inUse,
      outputTechnology,
      rotation,
      scaling,
      sourceMode: sourceModeValue.sourceMode,
      pathBuffer,
      sourceModeBuffer: sourceMode.buffer,
    };

    if (targetMode !== undefined) {
      const targetModeValue = targetMode.value;
      if (targetModeValue.infoType === "target") {
        output.targetVideoSignalInfo =
          targetModeValue.targetMode.targetVideoSignalInfo;
        output.targetModeBuffer = targetMode.buffer;
      }
    }

    ret.push(output);
  }
  return ret;
};

async function win32_toggleEnabledDisplays(args) {
  return new Promise((resolve, reject) => {
    const ran = addon.win32_toggleEnabledDisplays(args, (_, errorCode) => {
      if (errorCode === 0) {
        resolve();
      } else {
        reject(new Win32Error(errorCode));
      }
    });
    if (!ran) {
      resolve();
    }
  });
}

/**
 * @typedef ToggleEnabledDisplaysArgs
 * @type {object}
 * @property {string[]} enablePaths Exact Windows NT device paths of the displays to enable
 * @property {string[]} disablePaths Exact Windows NT device paths of the displays to disable
 * @property {boolean} persistent Whether to save this configuration as the default configuration
 */

/**
 * Toggles enabled/disabled state of the given displays.
 *
 * If "persistent", then this is saved between restarts.
 *
 * @param {ToggleEnabledDisplaysArgs} args
 */
module.exports.toggleEnabledDisplays = async (args) => {
  const { persistent, enable: enablePaths, disable: disablePaths } = args;
  const enable = [];
  const disable = [];

  const displayConfig = await module.exports.extractDisplayConfig();
  for (const { devicePath, targetConfigId } of displayConfig) {
    if (Array.isArray(enablePaths) && enablePaths.indexOf(devicePath) >= 0) {
      enable.push(targetConfigId);
    }
    if (Array.isArray(disablePaths) && disablePaths.indexOf(devicePath) >= 0) {
      disable.push(targetConfigId);
    }
  }

  await win32_toggleEnabledDisplays({ enable, disable, persistent });
};

function setSubtract(left, right) {
  const ret = new Set();
  for (const entry of left) {
    if (!right.has(entry)) {
      ret.add(entry);
    }
  }
  return Array.from(ret);
}

function devicePathLookupForEnabledDisplayConfig(conf) {
  const ret = {};
  for (const entry of conf) {
    if (entry.inUse && entry.targetModeBuffer === undefined) {
      continue;
    }
    if (ret[entry.devicePath] !== undefined) {
      continue;
    }
    ret[entry.devicePath] = entry;
  }
  return ret;
}

/**
 * @typedef DisplayRestorationConfigurationEntry
 * @type {object}
 * @property {string} devicePath
 * @property {string} pathBuffer A Base-64 encoded binary blob representing
 *   a DISPLAYCONFIG_PATH_INFO instance for the given devicePath
 * @property {string} sourceModeBuffer A Base-64 encoded binary blob representing
 *   a DISPLAYCONFIG_MODE_INFO source instance for the given devicePath
 * @property {string} targetModeBuffer A Base-64 encoded binary blob representing
 *   a DISPLAYCONFIG_MODE_INFO target instance for the given devicePath
 */

/**
 * Returns a display configuration suitable for restoration with {@link restoreDisplayConfig}.
 *
 * @returns {DisplayRestorationConfigurationEntry[]}
 */
module.exports.displayConfigForRestoration = async () => {
  const currentConfig = await module.exports.extractDisplayConfig();
  const ret = [];

  for (const entry of currentConfig) {
    if (!entry.inUse || entry.targetModeBuffer === undefined) {
      continue;
    }
    const {
      devicePath,
      pathBuffer,
      sourceModeBuffer,
      targetModeBuffer,
    } = entry;
    ret.push({
      devicePath,
      pathBuffer: pathBuffer.toString("base64"),
      sourceModeBuffer: sourceModeBuffer.toString("base64"),
      targetModeBuffer: targetModeBuffer.toString("base64"),
    });
  }

  return ret;
};

async function win32_restoreDisplayConfig(configs, persistent) {
  return new Promise((resolve, reject) => {
    const ran = addon.win32_restoreDisplayConfig(
      configs,
      (_, errorCode) => {
        if (errorCode === 0) {
          resolve();
        } else {
          reject(new Win32Error(errorCode));
        }
      },
      persistent
    );
    if (!ran) {
      resolve();
    }
  });
}

/**
 * @typedef RestoreDisplayConfigArgs
 * @type {object}
 * @property {DisplayRestorationConfigurationEntry[]} config
 * @property {boolean} persistent Whether to save this configuration as the default configuration
 */

/**
 * Restores a display configuration derived from {@link displayConfigForRestoration}.
 *
 * If the given configuration refers to enabled displays that are not currently attached,
 * this function simply enables the displays known to the given configuration and
 * disables all attached displays not known to the given configuration. Otherwise,
 * the given configuration is applied to the display set.
 *
 * @param {RestoreDisplayConfigArgs} args
 */
module.exports.restoreDisplayConfig = async (args) => {
  const devicePathNames = args.config
    .filter(({ targetModeBuffer }) => targetModeBuffer !== undefined)
    .map(({ devicePath }) => devicePath);
  const currentConfig = await module.exports.extractDisplayConfig();

  const givenAsSet = new Set(currentConfig.map(({ devicePath }) => devicePath));
  const expectedEnabledAsSet = new Set(devicePathNames);

  const missingEnabled = setSubtract(expectedEnabledAsSet, givenAsSet);

  // Here's the idea behind this:
  // We have a set of monitors we want enabled, and a set of monitors that are enabled.
  // Ideally, these should be identical sets. But it's also possible that
  //
  // 1. The current state has strictly more enabled monitors than the expected state
  // 2. The current state has strictly fewer enabled monitors than the expected state
  // 3. The current state has some monitors that are missing, and some that are unexpected.
  //
  // What we're about to do here is coerce the monitor state to the expected state; if more
  // monitors are enabled or disabled in the given state then that's fine, we're correcting
  // that away. The trick here is that the monitors in the expected state we _do_ want to
  // enable have to exist in the first place (we don't care about the ones we want to disable,
  // missing is also disabled if you squint hard enough).
  if (missingEnabled.length === 0) {
    const pathLookup = devicePathLookupForEnabledDisplayConfig(currentConfig);
    const coercedState = [];
    for (const entry of args.config) {
      if (entry.targetModeBuffer === undefined) {
        continue;
      }
      const currentConfigEntry = pathLookup[entry.devicePath];
      if (currentConfigEntry === undefined) {
        continue;
      }
      const { sourceConfigId, targetConfigId } = currentConfigEntry;
      const { pathBuffer, sourceModeBuffer, targetModeBuffer } = entry;
      coercedState.push({
        sourceConfigId,
        targetConfigId,
        pathBuffer: Buffer.from(pathBuffer, "base64"),
        sourceModeBuffer: Buffer.from(sourceModeBuffer, "base64"),
        targetModeBuffer: Buffer.from(targetModeBuffer, "base64"),
      });
    }

    await win32_restoreDisplayConfig(coercedState, args.persistent);
  } else {
    const seen = new Set();
    const enable = [];
    const disable = [];

    const notInUse = args.config
      .filter(({ targetModeBuffer }) => targetModeBuffer === undefined)
      .map(({ devicePath }) => devicePath);

    for (const devicePathName of devicePathNames) {
      if (!seen.has(devicePathName) && givenAsSet.has(devicePathName)) {
        enable.push(devicePathName);
        seen.add(devicePathName);
      }
    }
    for (const devicePathName of notInUse) {
      if (!seen.has(devicePathName) && givenAsSet.has(devicePathName)) {
        disable.push(devicePathName);
        seen.add(devicePathName);
      }
    }

    await module.exports.toggleEnabledDisplays({
      enable,
      disable,
      persistent: args.persistent,
    });
  }
};

let currentDisplayConfig;
const displayChangeCallbacks = new Set();

async function updateDisplayStateAndNotifyCallbacks() {
  try {
    currentDisplayConfig = await module.exports.extractDisplayConfig();
    for (const callback of Array.from(displayChangeCallbacks)) {
      callback(null, currentDisplayConfig);
    }
  } catch (e) {
    for (const callback of Array.from(displayChangeCallbacks)) {
      callback(e);
    }
  }
}

let currentDisplayConfigPromise = updateDisplayStateAndNotifyCallbacks();

function setupListenForDisplayChanges() {
  addon.win32_listenForDisplayChanges((err) => {
    if (err === null) {
      currentDisplayConfigPromise = currentDisplayConfigPromise.then(() =>
        updateDisplayStateAndNotifyCallbacks()
      );
    }
  });
}

/**
 * Registers a display change listener.
 *
 * This function will be called immediately upon registration, receiving the
 * current display configuration. It will also be called every time the display
 * configuration changes in Windows, e.g. when users attach or rearrange new
 * displays, or alter the output resolution of already-attached displays.
 *
 * Note that the Node event loop will continue executing if any outstanding change
 * listeners are registered, precluding graceful shutdown. Use {@link removeDisplayChangeListener}
 * to remove outstanding display change listeners and clear the event loop.
 *
 * @param {function(Error | null, ExtractedDisplayConfig | undefined): void} listener
 * @returns {function(Error | null, ExtractedDisplayConfig | undefined): void} the listener argument as passed
 */
module.exports.addDisplayChangeListener = (listener) => {
  if (displayChangeCallbacks.size === 0) {
    setupListenForDisplayChanges();
  }

  displayChangeCallbacks.add(listener);

  if (currentDisplayConfig !== undefined) {
    listener(null, currentDisplayConfig);
  }

  return listener;
};

/**
 * De-registers a display change listener.
 *
 * De-registering all display change listeners clears the event loop of pending
 * work started by {@link addDisplayChangeListener} to allow for a graceful shutdown.
 *
 * @param {function(Error | null, ExtractedDisplayConfig | undefined): void} listener previously passed to {@link addDisplayChangeListener}
 */
module.exports.removeDisplayChangeListener = (listener) => {
  displayChangeCallbacks.delete(listener);
  if (displayChangeCallbacks.size === 0) {
    addon.win32_stopListeningForDisplayChanges();
  }
};

/**
 * Establishes a context for determining the vertical refresh rate.
 *
 * Active instances of this class will establish perpetual work on the event loop,
 * as the internals use {@link addDisplayChangeListener} to react to display changes.
 *
 * In order to clear the relevant work on the Node event loop, you must call
 * {@link VerticalRefreshRateContext.close} when you are finished using this context.
 */
class VerticalRefreshRateContext {
  constructor() {
    let readyPromiseResolver;
    let readyPromiseResolved = false;

    this.readyPromise = new Promise((resolve) => {
      readyPromiseResolver = () => {
        if (readyPromiseResolved) return;
        readyPromiseResolved = true;
        resolve();
      };
    });
    this.geometry = [];

    const computeDisplayGeometryFromConfig = (err, conf) => {
      if (err !== null) {
        return;
      }
      const geom = [];

      for (const { sourceMode, targetVideoSignalInfo, inUse } of conf) {
        if (!inUse) {
          continue;
        }

        const { width, height, position } = sourceMode;
        const { vSyncFreq } = targetVideoSignalInfo;
        // 30Hz is a safe guess for broken vSyncFreq outputs, I think...
        const vRefreshRate =
          vSyncFreq.Numerator === 0 || vSyncFreq.Denominator === 0
            ? 30
            : vSyncFreq.Numerator / vSyncFreq.Denominator;
        const top = position.y;
        const bottom = position.y + height;
        const left = position.x;
        const right = position.x + width;

        geom.push({ top, bottom, left, right, vRefreshRate });
      }

      this.geometry = geom;
      readyPromiseResolver();
    };

    this.changeListener = module.exports.addDisplayChangeListener(
      computeDisplayGeometryFromConfig
    );
  }

  /**
   * Computes the vertical refresh rate of the displays at a given display point.
   *
   * If any displays overlap at the given display point, the return result will
   * be the minimum of the vertical refresh rates of each physical device displaying
   * at that effective point.
   *
   * This method is asynchronous due to the implementation of addDisplayChangeListener;
   * it waits for a valid display configuration to be captured before returning the
   * best possible refresh rate.
   *
   * @param {number} x The vertical offset of the display point
   * @param {number} y The horizontal offset of the display point
   *
   * @returns {number | undefined} The vertical refresh rate at the given display point,
   *   or undefined if the given display point is out of bounds of the available display space.
   */
  async findVerticalRefreshRateForDisplayPoint(x, y) {
    await this.readyPromise;

    let ret;
    for (const { top, bottom, left, right, vRefreshRate } of this.geometry) {
      if (left <= x && x < right && top <= y && y < bottom) {
        ret = ret === undefined ? vRefreshRate : Math.min(ret, vRefreshRate);
      }
    }

    return ret;
  }

  /**
   * Disconnects this instance from display change events.
   *
   * Disconnecting the instance from display change events will clear relevant
   * work items off of the event loop as per {@link removeDisplayChangeListener}.
   */
  close() {
    module.exports.removeDisplayChangeListener(this.changeListener);
  }
}

module.exports.VerticalRefreshRateContext = VerticalRefreshRateContext;

const { setVibrancy: wSetVibrancy, disableVibrancy: wDisableVibrancy } = require("bindings")("vibrancy-wrapper");
const os = require("os");
const eBrowserWindow = require("electron").BrowserWindow;
const { nativeTheme, screen } = require("electron");
const { VerticalRefreshRateContext } = require("win32-displayconfig");
const supportedType = ['light', 'dark', 'appearance-based'];

const _lightThemeColor = '#DDDDDD80', _darkThemeColor = '#22222280';

let _vibrancyDebug = false;

function isWindows10() {
    if (process.platform !== 'win32') return false;
    return os.release().split('.')[0] === '10';
}

function isRS4OrGreater() {
    if (!isWindows10()) return false;
    return !(os.release().split('.')[1] === '0' && parseInt(os.release().split('.')[2]) < 17134);
}

function getHwnd(win) {
    if (!win) { console.log('WINDOW_NOT_GIVEN'); return false; }
    try {
        const hbuf = win.getNativeWindowHandle();
        if (os.endianness() === "LE") {
            return hbuf.readInt32LE();
        } else {
            return hbuf.readInt32BE();
        }
    } catch (e) {
        console.log('NOT_VALID_WINDOW');
    }
}

function _setVibrancy(win, vibrancyOp = null) {
    try {
        if (vibrancyOp && vibrancyOp.colors) {
            if(_vibrancyDebug) console.log("Vibrancy On", vibrancyOp)
            wSetVibrancy(getHwnd(win), vibrancyOp.effect, vibrancyOp.colors.r, vibrancyOp.colors.g, vibrancyOp.colors.b, vibrancyOp.colors.a);
            win._vibrancyActivated = true;
            setTimeout(() => {
                try {
                    if (win._vibrancyActivated) win.setBackgroundColor('#00000000');
                } catch (e) {
    
                }
            }, 50);
        } else {
            if (_vibrancyDebug) console.log("Vibrancy Off", vibrancyOp, win._vibrancyOp)
            win._vibrancyActivated = false;
            if (win._vibrancyOp) {
                win.setBackgroundColor((win._vibrancyOp && win._vibrancyOp.colors && win._vibrancyOp.colors.blur ? "#FE" + win._vibrancyOp.colors.blur.substring(1,7) : "#00000000"));
            }
            setTimeout(() => {
                try { if (!win._vibrancyActivated) wDisableVibrancy(getHwnd(win)); } catch(e) { }
            }, 10);
        }
    } catch(e) {
        console.log(e)
    }
    
}

function sleep(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

function areBoundsEqual(left, right) {
    return left.height === right.height
        && left.width === right.width
        && left.x === right.x
        && left.y === right.y;
}

const billion = 1000 * 1000 * 1000;

function hrtimeDeltaForFrequency(freq) {
    return BigInt(Math.ceil(billion / freq));
}

let disableJitterFix = false

// Detect if cursor is near the screen edge. Used to disable the jitter fix in 'move' event.
function isInSnapZone() {
    const point = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(point)

    // Check if cursor is near the left/right edge of the active display
    if ((point.x > display.bounds.x - 20 && point.x < display.bounds.x + 20) || (point.x > display.bounds.x + display.bounds.width - 20 && point.x < display.bounds.x + display.bounds.width + 20)) {
        return true
    }
    return false
}

function opFormatter(vibrancyProps) {

    const defaultSettings = {
        theme: false,
        effect: 'acrylic',
        useCustomWindowRefreshMethod: true,
        maximumRefreshRate: 1000,
        disableOnBlur: true,
        debug: false
    }

    // Merge provided settings into defaults
    let vibrancyOp = Object.assign(defaultSettings, (typeof vibrancyProps === "object" ? vibrancyProps : { theme: vibrancyProps }))

    // Detect appropriate theme if 'appearance-based'
    if (vibrancyOp.theme && supportedType.indexOf(vibrancyOp.theme) === -1 && vibrancyOp.theme[0] !== '#') vibrancyOp.theme = 'appearance-based';
    if (vibrancyOp.theme === 'appearance-based') {
        if (nativeTheme.shouldUseDarkColors) vibrancyOp.theme = 'dark';
        else vibrancyOp.theme = 'light';
    }

    // Use default 'light' or 'dark' themes, if requested
    if (vibrancyOp.theme === 'light') vibrancyOp.theme = _lightThemeColor;
    else if (vibrancyOp.theme === 'dark') vibrancyOp.theme = _darkThemeColor;

    // Set blur type
    if (vibrancyOp.effect === 'acrylic' || vibrancyOp.effect === 1) {
        if (isRS4OrGreater()) vibrancyOp.effect = 1;
        else vibrancyOp.effect = 0;
    } else vibrancyOp.effect = 0;

    // Pre-calculate color values, if possible
    try {
        vibrancyOp.colors = (!vibrancyOp.theme ? false : {
            base: vibrancyOp.theme,
            r: parseInt(vibrancyOp.theme.substring(1, 3), 16),
            g: parseInt(vibrancyOp.theme.substring(3, 5), 16),
            b: parseInt(vibrancyOp.theme.substring(5, 7), 16),
            a: parseInt(vibrancyOp.theme.substring(7, 9), 16),
            blur: "#" + vibrancyOp.theme.substring(1, 7) + "FF",
            focus: vibrancyOp.theme
        })
    } catch(e) { }
    
    // Debug output
    if (_vibrancyDebug) console.log(vibrancyOp)

    return vibrancyOp;
}

class vBrowserWindow extends eBrowserWindow {
    constructor(props) {
        let oShow = props.show;
        if (!('show' in props)) oShow = true;
        if (props.vibrancy && props.vibrancy.debug) _vibrancyDebug = true;
        let vibrancyOp = opFormatter(props.vibrancy);
        if (isWindows10() && vibrancyOp) {
            props.vibrancy = null;
            if(vibrancyOp.theme)
                props.backgroundColor = (vibrancyOp.colors ? vibrancyOp.colors.base.substring(0, 7) : "#00000000");
            props.show = false;
        }
        const win = new eBrowserWindow(props);
        vBrowserWindow._bindAndReplace(win, vBrowserWindow.setVibrancy);
        win._vibrancyOp = vibrancyOp;
        win._vibrancyActivated = false;

        if (vibrancyOp && vibrancyOp.useCustomWindowRefreshMethod) {

            // Unfortunately, we have to re-implement moving and resizing.
            // Enabling vibrancy slows down the window's event handling loop to the
            // point building a mouse event backlog. If you just handle these events
            // in the backlog without taking the time difference into consideration,
            // you end up with visible movement lag.
            //
            // We tried pairing 'will-move' with 'move', but Electron actually sends the
            // 'move' events _before_ Windows actually commits to the operation. There's
            // likely some queuing going on that's getting backed up. This is not the case
            // with 'will-resize' and 'resize', which need to use the default behavior
            // for compatibility with soft DPI scaling.
            //
            // The ideal rate of moving and resizing is based on the vertical sync
            // rate: if your display is only fully updating at 120 Hz, we shouldn't
            // be attempting to reset positions or sizes any faster than 120 Hz.
            // If we were doing this in a browser context, we would just use
            // requestAnimationFrame and call it a day. But we're not inside of a
            // browser context here, so we have to resort to clever hacks.
            //
            // This VerticalRefreshRateContext maps a point in screen space to the
            // vertical sync rate of the display(s) actually handing that point.
            // It handles multiple displays with varying vertical sync rates,
            // and changes to the display configuration while this process is running.
            const refreshCtx = new VerticalRefreshRateContext();

            function getRefreshRateAtCursor(cursor) {
                cursor = cursor || screen.getCursorScreenPoint();
                return refreshCtx.findVerticalRefreshRateForDisplayPoint(cursor.x, cursor.y);
            }

            // Ensure all movement operation is serialized, by setting up a continuous promise chain
            // All movement operation will take the form of
            //
            //     boundsPromise = boundsPromise.then(() => { /* work */ })
            //
            // So that there are no asynchronous race conditions.
            let pollingRate;
            let doFollowUpQuery = false, isMoving = false, shouldMove = false;
            let moveLastUpdate = BigInt(0), resizeLastUpdate = BigInt(0);
            let lastWillMoveBounds, lastWillResizeBounds, desiredMoveBounds;
            let boundsPromise = Promise.race([
                getRefreshRateAtCursor().then(rate => {
                    pollingRate = rate || 30;
                    doFollowUpQuery = true;
                }),
                // Establishing the display configuration can fail; we can't
                // just block forever if that happens. Instead, establish
                // a fallback polling rate and hope for the best.
                sleep(2000).then(() => {
                    pollingRate = pollingRate || 30;
                })
            ]);

            async function doFollowUpQueryIfNecessary(cursor) {
                if (doFollowUpQuery) {
                    const rate = await getRefreshRateAtCursor(cursor);
                    if(_vibrancyDebug && rate != pollingRate) console.log(`New polling rate: ${rate}`)
                    pollingRate = rate || 30;
                }
            }

            function setWindowBounds(bounds) {
                if (win.isDestroyed()) {
                    return;
                }
                win.setBounds(bounds);
                desiredMoveBounds = win.getBounds();
            }

            function currentTimeBeforeNextActivityWindow(lastTime, forceFreq) {
                return process.hrtime.bigint() <
                    lastTime + hrtimeDeltaForFrequency(forceFreq || pollingRate || 30);
            }

            function guardingAgainstMoveUpdate(fn) {
                if (pollingRate === undefined || !currentTimeBeforeNextActivityWindow(moveLastUpdate)) {
                    moveLastUpdate = process.hrtime.bigint();
                    fn();
                    return true;
                } else {
                    return false;
                }
            }

            win.on('will-move', (e, newBounds) => {
                // We get a _lot_ of duplicate bounds sent to us in this event.
                // This messes up our timing quite a bit.
                if (lastWillMoveBounds !== undefined && areBoundsEqual(lastWillMoveBounds, newBounds)) {
                    e.preventDefault();
                    return;
                }
                lastWillMoveBounds = newBounds;
                // If we're asked to perform some move update and it's under
                // the refresh speed limit, we can just do it immediately.
                // This also catches moving windows with the keyboard.
                const didOptimisticMove = !isMoving && guardingAgainstMoveUpdate(() => {
                    // Do nothing, the default behavior of the event is exactly what we want.
                    desiredMoveBounds = undefined;
                });
                if (didOptimisticMove) {
                    boundsPromise = boundsPromise.then(doFollowUpQueryIfNecessary);
                    return;
                }
                e.preventDefault();

                // Track if the user is moving the window
                if (win._moveTimeout) clearTimeout(win._moveTimeout);
                win._moveTimeout = setTimeout(() => {
                    shouldMove = false;
                }, 1000 / Math.min(pollingRate, vibrancyOp.maximumRefreshRate));

                // Disable next event ('move') if cursor is near the screen edge
                disableJitterFix = isInSnapZone()

                // Start new behavior if not already
                if (!shouldMove) {
                    shouldMove = true;

                    if (isMoving) return false;
                    isMoving = true;

                    // Get start positions
                    const basisBounds = win.getBounds();
                    const basisCursor = screen.getCursorScreenPoint();

                    // Handle polling at a slower interval than the setInterval handler
                    function handleIntervalTick(moveInterval) {
                        boundsPromise = boundsPromise.then(() => {
                            if (!shouldMove) {
                                isMoving = false;
                                clearInterval(moveInterval);
                                return;
                            }

                            const cursor = screen.getCursorScreenPoint();
                            const didIt = guardingAgainstMoveUpdate(() => {
                                // Set new position
                                setWindowBounds({
                                    x: basisBounds.x + (cursor.x - basisCursor.x),
                                    y: basisBounds.y + (cursor.y - basisCursor.y),
                                    width: basisBounds.width,
                                    height: basisBounds.height
                                });
                            });
                            if (didIt) {
                                return doFollowUpQueryIfNecessary(cursor);
                            }
                        });
                    }

                    // Poll at 600hz while moving window
                    const moveInterval = setInterval(() => handleIntervalTick(moveInterval), 1000 / 600);
                }
            });

            win.on('move', (e) => {
                if (disableJitterFix) {
                    return true;
                }
                if (isMoving || win.isDestroyed()) {
                    e.preventDefault();
                    return false;
                }
                // As insane as this sounds, Electron sometimes reacts to prior
                // move events out of order. Specifically, if you have win.setBounds()
                // twice, then for some reason, when you exit the move state, the second
                // call to win.setBounds() gets reverted to the first call to win.setBounds().
                //
                // Again, it's nuts. But what we can do in this circumstance is thwack the
                // window back into place just to spite Electron. Yes, there's a shiver.
                // No, there's not much we can do about it until Electron gets their act together.
                if (desiredMoveBounds !== undefined) {
                    const forceBounds = desiredMoveBounds;
                    desiredMoveBounds = undefined;
                    win.setBounds({
                        x: forceBounds.x,
                        y: forceBounds.y,
                        width: forceBounds.width,
                        height: forceBounds.height
                    });
                }
            });

            win.on('will-resize', (e, newBounds) => {
                if (lastWillResizeBounds !== undefined && areBoundsEqual(lastWillResizeBounds, newBounds)) {
                    e.preventDefault();
                    return;
                }

                lastWillResizeBounds = newBounds;

                // 60 Hz ought to be enough... for resizes.
                // Some systems have trouble going 120 Hz, so we'll just take the lower
                // of the current pollingRate and 60 Hz.
                if (pollingRate !== undefined &&
                    currentTimeBeforeNextActivityWindow(resizeLastUpdate, Math.min(pollingRate, 60))) {
                    e.preventDefault();
                    return false;
                }
                // We have to count this twice: once before the resize,
                // and once after the resize. We actually don't have any
                // timing control around _when_ the resize happened, so
                // we have to be pessimistic.
                resizeLastUpdate = process.hrtime.bigint();
            });

            win.on('resize', () => {
                resizeLastUpdate = process.hrtime.bigint();
                boundsPromise = boundsPromise.then(doFollowUpQueryIfNecessary);
            });

            // Close the VerticalRefreshRateContext so Node can exit cleanly
            win.on('closed', refreshCtx.close);
        }

        if (vibrancyOp && vibrancyOp.disableOnBlur) {
            win.on('blur', () => {
                if (isWindows10() && win._vibrancyOp) _setVibrancy(win, null);
            })

            win.on('focus', () => {
                if (isWindows10() && win._vibrancyOp) _setVibrancy(win, win._vibrancyOp);
            })
        }

        if (isWindows10() && props.hasOwnProperty('vibrancy')) win.once('ready-to-show', () => {
            setTimeout(() => {
                if (oShow) win.show();
                win.setVibrancy(win._vibrancyOp);
            }, 100);
        });

        return win;
    }

    static setVibrancy(op = null) {
        if(!op) {
            // If disabling vibrancy, turn off then save
            _setVibrancy(this, null)
            this._vibrancyOp = opFormatter(op);
        } else {
            this._vibrancyOp = opFormatter(op);
            if (!isWindows10()) super.setVibrancy(this._vibrancyOp);
            else {
                if (!op) _setVibrancy(this, null);
                else _setVibrancy(this, this._vibrancyOp);
            }
        }
        
    }

    static _bindAndReplace(object, method) {
        const boundFunction = method.bind(object);
        Object.defineProperty(object, method.name, {
            get: () => boundFunction
        });
    }
}

function setVibrancy(win, op = 'appearance-based') {
    // If disabling vibrancy, turn off then save
    if(!op) {
        _setVibrancy(this, null);
        win._vibrancyOp = opFormatter(op);
    } else {
        win._vibrancyOp = opFormatter(op);
        if (!isWindows10()) win.setVibrancy(win._vibrancyOp);
        else {
            if (!op) _setVibrancy(this, null);
            else _setVibrancy(this, win._vibrancyOp);
        }
    }
}

exports.setVibrancy = setVibrancy;
exports.BrowserWindow = vBrowserWindow;
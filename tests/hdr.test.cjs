const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const parser = require('@babel/parser')

// Run the production handlers with mocked Windows/IPC boundaries, without
// booting Electron or changing the developer's display settings.
function loadHandlers(file, names, globals) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    const ast = parser.parse(source, { sourceType: file.endsWith('.jsx') ? 'module' : 'script', strictMode: false, allowReturnOutsideFunction: true, plugins: ['jsx'] })
    const statements = ast.program.body.filter(node => names.includes(
        node.type === 'FunctionDeclaration' ? node.id.name :
        node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression'
            ? node.expression.left.name : undefined
    ))
    assert.equal(statements.length, names.length, 'All production handlers must be loaded')
    const context = vm.createContext({ console: { log() {}, error() {} }, ...globals })
    const code = statements.map(node => source.slice(node.start, node.end)).join('\n')
    vm.runInContext(file.endsWith('.jsx') ? require('@babel/core').transformSync(code, {
        configFile: false, babelrc: false, presets: ['@babel/preset-react']
    }).code : code, context)
    return context
}

function displays() {
    return [
        { name: 'HDR on', path: 'DISPLAY#ON#one', nits: 124, hdrSupported: true, hdrEnabled: true, hdrActive: true },
        { name: 'HDR off', path: 'DISPLAY#OFF#two', nits: 80, hdrSupported: true, hdrEnabled: false, hdrActive: false },
        { name: 'SDR', path: 'DISPLAY#SDR#three', nits: 80, hdrSupported: false, hdrEnabled: false, hdrActive: false }
    ]
}

function workerHarness(overrides = {}) {
    const calls = []
    const context = loadHandlers('src/Monitors.js', ['getHDRDisplays', 'setHDRState', 'setSDRBrightness', 'handleMonitorMessage'], {
        settings: {}, lastHDR: {},
        updateDisplay(monitors, key, data) { monitors[key] = { type: 'none', ...data } },
        process: { send(data) { calls.push(['ipc', data]) } },
        hdr: {
            getDisplays: displays,
            setHDRState(id, enabled) { calls.push(['hdr', id, enabled]); return true },
            setSDRBrightness(id, nits) { calls.push(['sdr', id, nits]); return true },
            ...overrides
        }
    })
    return { context, calls }
}

test('HDR capability remains visible while HDR is off', async () => {
    const { context } = workerHarness()
    const monitors = await context.getHDRDisplays({})
    assert.equal(monitors.one.hdr, 'active')
    assert.equal(monitors.one.sdrLevel, 11)
    assert.equal(monitors.two.hdr, 'supported')
    assert.equal(monitors.two.hdrEnabled, false)
    assert.equal(monitors.two.hdrSupported, true)
    assert.equal(monitors.three.hdr, 'unsupported')
})

test('toggle uses current Windows state, and ignores unsupported or missing displays', () => {
    const { context, calls } = workerHarness()
    assert.equal(context.setHDRState(null, 'DISPLAY#ON#one'), true)
    assert.equal(context.setHDRState(null, 'DISPLAY#OFF#two'), true)
    assert.equal(context.setHDRState(null, 'DISPLAY#SDR#three'), false)
    assert.equal(context.setHDRState(null, 'disconnected'), false)
    assert.deepEqual(calls, [['hdr', 'DISPLAY#ON#one', false], ['hdr', 'DISPLAY#OFF#two', true]])
})

test('worker returns correlated success or failure for HDR requests', async () => {
    const { context, calls } = workerHarness({ setHDRState() { throw new Error('Windows denied the request') } })
    await context.handleMonitorMessage({ type: 'hdr', id: 'DISPLAY#ON#one', enabled: false, requestId: 'test' })
    assert.equal(calls[0][1].requestId, 'test')
    assert.equal(calls[0][1].success, false)
    context.settings.disableHDR = true
    assert.equal(context.setHDRState(true, 'DISPLAY#ON#one'), false)
    assert.equal(context.setSDRBrightness(50, 'DISPLAY#ON#one'), false)
})

test('SDR percentage maps to Windows white level and clamps invalid ranges', () => {
    const { context, calls } = workerHarness()
    for (const level of [-20, 0, 50, 100, 140]) context.setSDRBrightness(level, 'display')
    assert.deepEqual(calls.map(call => call[2]), [80, 80, 280, 480, 480])
    assert.equal(context.setSDRBrightness(NaN, 'display'), false)
    assert.equal(context.setSDRBrightness(Infinity, 'display'), false)
    assert.equal(context.setSDRBrightness('50', 'display'), false)
})

function hotkeyHarness(extraHandlers = []) {
    const calls = []
    const context = loadHandlers('src/electron.js', ['doHotkey', 'usesHDRBrightness', ...extraHandlers], {
        settings: { hotkeysBreakLinkedLevels: true, linkedLevelsActive: true, hideDisplays: { hidden: true } },
        monitors: {
            on: { key: 'on', id: 'on', hdrSupported: true, hdrEnabled: true, hdr: 'active', sdrLevel: 98, type: 'none' },
            off: { key: 'off', id: 'off', hdrSupported: true, hdrEnabled: false, hdr: 'supported', type: 'none' },
            sdr: { key: 'sdr', id: 'sdr', hdrSupported: false, hdr: 'unsupported', type: 'ddcci' },
            hidden: { key: 'hidden', id: 'hidden', hdrSupported: true, hdr: 'active', type: 'ddcci' }
        },
        doingHotkey: false, hotkeyThrottle: [], hotkeyCycleIndexes: [],
        lastRefreshMonitors: Date.now(), isWindowsUserIdle: false, panelState: 'hidden', pausedMonitorUpdates: false,
        setRecentlyInteracted() {},
        async refreshMonitors(...args) { calls.push(['refresh', ...args]) },
        async updateHDRState(monitor, enabled) { calls.push(['hdr', monitor.id, enabled]); return true },
        updateBrightnessThrottle(...args) { calls.push(['brightness', ...args]) },
        sendToAllWindows() {}, pauseMonitorUpdates() {}, writeSettings() {},
        minMax(value) { return Math.max(0, Math.min(100, value)) },
        hotkeyOverlayStart() { calls.push(['overlay']) }
    })
    return { context, calls }
}

test('HDR hotkeys target selected HDR-only monitors independently of linked brightness', async () => {
    const { context, calls } = hotkeyHarness()
    await context.doHotkey({ id: 'selected', actions: [{ type: 'hdr-toggle', monitors: { off: true } }] })
    assert.deepEqual(calls.filter(call => call[0] === 'hdr'), [['hdr', 'off', null]])
    assert.equal(calls.filter(call => call[0] === 'refresh').at(-1)[1], true)
    assert.equal(context.doingHotkey, false)
})

test('HDR on/off for all monitors skips unsupported and hidden monitors', async () => {
    const { context, calls } = hotkeyHarness()
    for (const [type, enabled] of [['hdr-on', true], ['hdr-off', false]]) {
        calls.length = 0
        await context.doHotkey({ id: type, actions: [{ type, allMonitors: true }] })
        assert.deepEqual(calls.filter(call => call[0] === 'hdr'), [['hdr', 'on', enabled], ['hdr', 'off', enabled]])
    }
})

test('SDR hotkeys only adjust active HDR and clamp offsets at 100%', async () => {
    const { context, calls } = hotkeyHarness()
    await context.doHotkey({ id: 'sdr', actions: [{ type: 'offset', target: 'sdr', value: 10, allMonitors: true }] })
    // Hidden monitors are rejected by updateBrightness in production.
    assert.deepEqual(calls.find(call => call[0] === 'brightness' && call[1] === 'on'), ['brightness', 'on', 100, false, true, 'sdr'])
    assert.equal(calls.some(call => call[0] === 'brightness' && ['off', 'sdr'].includes(call[1])), false)
    assert.equal(calls.some(call => call[0] === 'overlay'), true)
})

test('disabled HDR and sleeping displays do not execute HDR actions', async () => {
    const { context, calls } = hotkeyHarness()
    context.settings.disableHDR = true
    await context.doHotkey({ id: 'disabled', actions: [{ type: 'hdr-toggle', allMonitors: true }] })
    context.settings.disableHDR = false
    context.isWindowsUserIdle = true
    await context.doHotkey({ id: 'asleep', actions: [{ type: 'hdr-on', allMonitors: true }] })
    assert.equal(calls.length, 0)
})

test('failed HDR action releases hotkey lock and permits the next shortcut', async () => {
    const { context, calls } = hotkeyHarness()
    context.updateHDRState = async () => { throw new Error('worker stopped') }
    await context.doHotkey({ id: 'fails', actions: [{ type: 'hdr-on', allMonitors: true }] })
    assert.equal(context.doingHotkey, false)
    context.updateHDRState = async monitor => { calls.push(['recovered', monitor.id]); return true }
    await context.doHotkey({ id: 'next', actions: [{ type: 'hdr-off', monitors: { on: true } }] })
    assert.equal(calls.some(call => call[0] === 'recovered'), true)
})

test('HDR IPC waits for matching acknowledgement and cleans up listeners', async () => {
    const emitter = new EventEmitter()
    const context = loadHandlers('src/electron.js', ['updateHDRState'], {
        settings: {}, isWindowsUserIdle: false, monitorsEventEmitter: emitter,
        setTimeout, clearTimeout, async waitForMonitorWorkerIdle() {},
        monitorsThread: { async send(data) {
            emitter.emit('hdrStateChanged', { requestId: 'unrelated', success: false })
            emitter.emit('hdrStateChanged', { requestId: data.requestId, success: true })
            return true
        } }
    })
    assert.equal(await context.updateHDRState({ id: 'display', hdrSupported: true }, true), true)
    assert.equal(emitter.listenerCount('hdrStateChanged'), 0)
    context.monitorsThread.send = async () => false
    assert.equal(await context.updateHDRState({ id: 'display', hdrSupported: true }, false), false)
    assert.equal(emitter.listenerCount('hdrStateChanged'), 0)
})

test('SDR updates work without DDC/CI while features are pending, and stay in range', () => {
    const sent = []
    const monitor = { id: 'display', key: 'display', hdr: 'active', type: 'none', featuresPending: true }
    const context = loadHandlers('src/electron.js', ['updateBrightness', 'usesHDRBrightness'], {
        settings: {}, isWindowsUserIdle: false, monitors: { display: monitor }, currentTransition: null,
        minMax(value) { return Math.max(0, Math.min(100, value)) },
        shouldSkipDisplay() { return false }, usesExtendedMinimum() { return false },
        normalizeBrightness(value) { return value }, setTrayPercent() {}, updateKnownDisplays() {},
        monitorsThread: { send(data) { sent.push(data) } },
        deferFeatureUpdate() { assert.fail('SDR must not wait for DDC features') },
        debug: { error(...args) { assert.fail(JSON.stringify(args)) } }
    })
    context.updateBrightness('display', 130, false, 'sdr')
    assert.equal(sent[0].brightness, 100)
    assert.equal(monitor.sdrLevel, 100)
    monitor.hdr = 'supported'
    assert.equal(context.updateBrightness('display', 50, false, 'sdr'), false)
    assert.equal(context.updateBrightness('display', NaN, false, 'sdr'), false)
    assert.equal(sent.length, 1)
})

test('HDR-only monitors can be selected for HDR shortcuts and SDR brightness', () => {
    const React = require('react')
    const { renderToStaticMarkup } = require('react-dom/server')
    const context = loadHandlers('src/components/SettingsWindow.jsx', ['ActionItem'], {
        React, T: { t(key) { return key } }, getMonitorName(monitor) { return monitor.name },
        isAdjustableDisplay(monitor) { return monitor.type !== 'none' }
    })
    const monitors = {
        hdr: { id: 'hdr', key: 'hdr', name: 'HDR-only display', type: 'none', hdrSupported: true },
        sdr: { id: 'sdr', key: 'sdr', name: 'SDR-only display', type: 'ddcci', hdrSupported: false }
    }
    for (const action of [
        { type: 'hdr-toggle', target: 'brightness' },
        { type: 'offset', target: 'sdr' },
        { type: 'set', target: 'brightness' }
    ]) {
        const html = renderToStaticMarkup(React.createElement(context.ActionItem, {
            action: { allMonitors: false, monitors: {}, ...action }, monitors, monitorNames: {}
        }))
        assert.equal(html.includes('HDR-only display'), action.target === 'sdr' || action.type === 'hdr-toggle')
        assert.equal(html.includes('SDR-only display'), action.target === 'brightness' && action.type === 'set')
        assert.equal(html.includes('SETTINGS_HOTKEY_ACTION_HDR_TOGGLE'), true)
    }
})

test('HDR acknowledgement timeout releases listeners', async () => {
    const emitter = new EventEmitter()
    const context = loadHandlers('src/electron.js', ['updateHDRState'], {
        settings: {}, isWindowsUserIdle: false, monitorsEventEmitter: emitter,
        setTimeout(callback) { queueMicrotask(callback); return 1 }, clearTimeout() {},
        async waitForMonitorWorkerIdle() {}, monitorsThread: { async send() { return true } }
    })
    assert.equal(await context.updateHDRState({ id: 'display', hdrSupported: true }, true), false)
    assert.equal(emitter.listenerCount('hdrStateChanged'), 0)
})

test('HDR refresh waits for brightness pause to end before running the next action', async () => {
    const { context, calls } = hotkeyHarness()
    context.pausedMonitorUpdates = true
    context.Utils = { async wait() { context.pausedMonitorUpdates = false; calls.push(['unpaused']) } }
    await context.doHotkey({ id: 'combined', actions: [
        { type: 'hdr-on', monitors: { off: true } },
        { type: 'set', target: 'sdr', value: 20, monitors: { off: true } }
    ] })
    const unpaused = calls.findIndex(call => call[0] === 'unpaused')
    const refreshed = calls.findIndex(call => call[0] === 'refresh' && call[1] === true)
    assert.equal(unpaused >= 0 && refreshed > unpaused, true)
    assert.equal(context.doingHotkey, false)
})

test('default brightness keys are installed once without overriding custom shortcuts', () => {
    const context = loadHandlers('src/electron.js', ['createDefaultBrightnessHotkeys', 'installDefaultBrightnessHotkeys'], {})
    const custom = { id: 'custom', accelerator: 'Control+]', actions: [{ type: 'hdr-toggle' }] }
    const settings = { hotkeys: [custom] }
    assert.equal(context.installDefaultBrightnessHotkeys(settings), true)
    assert.equal(settings.hotkeys.length, 2)
    assert.equal(settings.hotkeys[0], custom)
    const down = settings.hotkeys[1]
    assert.equal(down.accelerator, 'Ctrl+[')
    assert.equal(down.actions[0].value, -10)
    assert.equal(down.actions[0].target, 'brightness')
    assert.equal(down.actions[0].allMonitors, true)
    settings.hotkeys = []
    assert.equal(context.installDefaultBrightnessHotkeys(settings), false)
    assert.equal(settings.hotkeys.length, 0)
    const fresh = { hotkeys: [] }
    context.installDefaultBrightnessHotkeys(fresh)
    assert.equal(fresh.hotkeys[0].accelerator, 'Ctrl+]')
    assert.equal(fresh.hotkeys[0].actions[0].value, 10)
})

test('brightness offsets read the active mode value and accumulate before throttled writes', async () => {
    const { context, calls } = hotkeyHarness()
    context.monitors.on.sdrLevel = 30
    context.monitors.on.brightness = 80 // hardware brightness must not be used in HDR
    context.monitors.off.brightness = 60
    for (const id of ['first', 'second']) {
        await context.doHotkey({ id, actions: [{ type: 'offset', target: 'brightness', value: 10, allMonitors: true }] })
    }
    const updates = calls.filter(call => call[0] === 'brightness')
    assert.deepEqual(updates.filter(call => call[1] === 'on').map(call => call[2]), [40, 50])
    assert.deepEqual(updates.filter(call => call[1] === 'off').map(call => call[2]), [70, 80])
    assert.equal(context.monitors.on.sdrLevel, 50)
    assert.equal(updates.some(call => call[1] === 'hidden'), false)
})

function brightnessHarness(monitor) {
    const sent = []
    const context = loadHandlers('src/electron.js', ['updateBrightness', 'usesHDRBrightness'], {
        settings: { sdrAsMainSliderDisplays: { display: false } },
        isWindowsUserIdle: false, monitors: { display: monitor }, currentTransition: null,
        minMax(value) { return Math.max(0, Math.min(100, value)) },
        shouldSkipDisplay() { return false }, usesGammaSlider() { return false }, usesExtendedMinimum() { return false },
        normalizeBrightness(value) { return value }, setTrayPercent() {}, updateKnownDisplays() {},
        monitorsThread: { send(data) { sent.push(data) } }, applyLinkedFeatures() {},
        debug: { error(...args) { assert.fail(JSON.stringify(args)) } }
    })
    return { context, sent }
}

test('one brightness target changes Windows white level in HDR and hardware brightness in SDR', () => {
    const monitor = { id: 'display', key: 'display', hdr: 'active', type: 'ddcci', brightness: 80, sdrLevel: 30, brightnessMax: 100 }
    const { context, sent } = brightnessHarness(monitor)
    context.updateBrightness('display', 40)
    assert.equal(sent[0].type, 'sdr')
    assert.equal(sent[0].brightness, 40)
    assert.equal(monitor.brightness, 40)
    assert.equal(monitor.sdrLevel, 40)
    monitor.hdr = 'supported'
    context.updateBrightness('display', 70)
    assert.equal(sent[1].type, 'brightness')
    assert.equal(sent[1].brightness, 70)
    assert.equal(monitor.brightness, 70)
    assert.equal(monitor.sdrLevel, 40)
})

test('HDR-only monitors use the same brightness target without waiting for DDC features', () => {
    const monitor = { id: 'display', key: 'display', hdr: 'active', type: 'none', featuresPending: true }
    const { context, sent } = brightnessHarness(monitor)
    context.deferFeatureUpdate = () => assert.fail('HDR brightness does not require DDC features')
    context.updateBrightness('display', 55)
    assert.equal(sent[0].type, 'sdr')
    assert.equal(monitor.brightness, 55)
})

test('refresh replaces slider value with the current mode value after HDR is switched', () => {
    const context = loadHandlers('src/electron.js', ['commitRefreshedMonitors', 'usesHDRBrightness'], {
        settings: {}, monitors: {}, lightSensor: { setMonitors() {} }, lastCompletedRefresh: 0,
        applyOrder() {}, applyRemaps() {}, applyHotkeys() {}, restoreGammaAfterReset() {},
        normalizeBrightness(value) { return value }, usesGammaSlider() { return false }, usesExtendedMinimum() { return false },
        flushDeferredFeatureUpdates() {}, setTrayPercent() {}, sendToAllWindows() {}
    })
    for (const [hdr, expected] of [['active', 25], ['supported', 75], ['active', 25]]) {
        const monitor = { id: 'display', key: 'display', hwid: ['DISPLAY', 'MODEL', 'display'], hdr, brightness: 75, sdrLevel: 25 }
        context.commitRefreshedMonitors({ display: monitor })
        assert.equal(context.monitors.display.brightness, expected)
    }
})

function loadRenderer(file, mocks, globals = {}) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    const code = require('@babel/core').transformSync(source, {
        configFile: false, babelrc: false, presets: ['@babel/preset-react'], plugins: ['@babel/plugin-transform-modules-commonjs']
    }).code
    const module = { exports: {} }
    vm.runInNewContext(code, {
        module, exports: module.exports, console,
        require(name) { assert.ok(name in mocks, `Unexpected renderer dependency: ${name}`); return mocks[name] },
        ...globals
    })
    return module.exports
}

test('panel renders one brightness slider for SDR, HDR and HDR-only monitors', () => {
    const React = require('react')
    const { renderToStaticMarkup } = require('react-dom/server')
    const window = { settings: {}, allMonitors: {}, isAppX: false, micaState: { visibility: 'hidden', src: '' } }
    const utils = loadRenderer('src/components/utilts/monitor.util.js', {}, { window })
    const panel = loadRenderer('src/components/BrightnessPanel.jsx', {
        react: React,
        './Slider': props => React.createElement('input', { type: 'range', 'data-brightness': props.id, value: props.level, readOnly: true }),
        './DDCCISliders': () => null,
        '../TranslateReact': class { t() { return '' } },
        '../utils/BrightnessPanel/getMonitorName': monitor => monitor.name,
        './utilts/monitor.util': utils
    }, { window }).default
    for (const [hdr, type] of [['supported', 'ddcci'], ['active', 'ddcci'], ['active', 'none']]) {
        window.allMonitors = { display: { id: 'display', key: 'display', hwid: ['DISPLAY', 'MODEL', 'display'], hdr, type, brightness: 35, brightnessType: 0x10, name: 'Monitor' } }
        for (const monitorFeatures of [{}, { MODEL: { '0x12': true } }]) {
            window.settings = { monitorFeatures, hdrDisplays: { display: true }, sdrAsMainSliderDisplays: { display: false } }
            const html = renderToStaticMarkup(React.createElement(panel))
            assert.equal((html.match(/type="range"/g) || []).length, 1)
            assert.equal(html.includes('value="35"'), true)
        }
    }
})

test('slider scrolling follows refreshed brightness after a hotkey or mode change', () => {
    const React = require('react')
    const Slider = loadRenderer('src/components/Slider.jsx', {
        react: React, 'prop-types': require('prop-types'), './utilts/monitor.util': { displayLevel: Math.round }
    }).default
    const changes = []
    const slider = new Slider({ level: 80, scrollAmount: 10, onChange: value => changes.push(value) })
    slider.setState = (state, callback) => { Object.assign(slider.state, state); callback?.() }
    slider.props = { ...slider.props, level: 30 }
    slider.componentDidUpdate({ level: 80 })
    assert.equal(changes.length, 0)
    slider.handleWheel({ deltaY: -1 })
    assert.equal(changes[0], 40)
})

test('existing HDR-only bracket shortcuts migrate without changing values or monitor selection', () => {
    const context = loadHandlers('src/electron.js', ['createDefaultBrightnessHotkeys', 'installDefaultBrightnessHotkeys'], {})
    const settings = { defaultBrightnessHotkeysVersion: 1, hotkeys: [
        { id: 'up', accelerator: 'Control+]', actions: [{ type: 'offset', target: 'sdr', value: '10', allMonitors: true, monitors: { display: true } }] },
        { id: 'down', accelerator: 'Control+[', actions: [{ type: 'offset', target: 'sdr', value: '-10', allMonitors: false, monitors: { display: true } }] },
        { id: 'hdr-only', accelerator: 'Ctrl+Alt+H', actions: [{ type: 'set', target: 'sdr', value: 30 }] },
        { id: 'hdr-toggle', accelerator: 'Shift+Control+P', actions: [{ type: 'hdr-toggle', target: 'brightness' }] }
    ] }
    const previous = JSON.parse(JSON.stringify(settings))
    assert.equal(context.installDefaultBrightnessHotkeys(settings), true)
    previous.defaultBrightnessHotkeysVersion = 2
    previous.hotkeys[0].actions[0].target = 'brightness'
    previous.hotkeys[1].actions[0].target = 'brightness'
    assert.deepEqual(JSON.parse(JSON.stringify(settings)), previous)
    assert.equal(context.installDefaultBrightnessHotkeys(settings), false)
    const deleted = { defaultBrightnessHotkeysVersion: 1, hotkeys: [] }
    assert.equal(context.installDefaultBrightnessHotkeys(deleted), true)
    assert.equal(deleted.hotkeys.length, 0)
})

test('migrated Ctrl brackets send brightness changes in HDR, SDR, then HDR again', async () => {
    const migration = loadHandlers('src/electron.js', ['createDefaultBrightnessHotkeys', 'installDefaultBrightnessHotkeys'], {})
    const settings = { defaultBrightnessHotkeysVersion: 1, hotkeys: [
        { id: 'up', accelerator: 'Control+]', actions: [{ type: 'offset', target: 'sdr', value: '10', monitors: { on: true } }] },
        { id: 'down', accelerator: 'Control+[', actions: [{ type: 'offset', target: 'sdr', value: '-10', monitors: { on: true } }] }
    ] }
    migration.installDefaultBrightnessHotkeys(settings)
    const { context } = hotkeyHarness(['updateBrightness'])
    const sent = []
    Object.assign(context, {
        currentTransition: null, shouldSkipDisplay() { return false }, usesGammaSlider() { return false },
        usesExtendedMinimum() { return false }, normalizeBrightness(value) { return value },
        setTrayPercent() {}, updateKnownDisplays() {}, applyLinkedFeatures() {},
        monitorsThread: { send(data) { sent.push(data) } },
        debug: { error(...args) { assert.fail(JSON.stringify(args)) } }
    })
    context.updateBrightnessThrottle = (...args) => context.updateBrightness(...args.slice(0, 3))
    const monitor = context.monitors.on
    monitor.type = 'ddcci'
    monitor.brightnessMax = 100
    for (const [hdr, current, expectedType] of [['active', 30, 'sdr'], ['supported', 60, 'brightness'], ['active', 30, 'sdr']]) {
        monitor.hdr = hdr
        monitor.brightness = current
        if (hdr === 'active') monitor.sdrLevel = current;
        for (const hotkey of settings.hotkeys) {
            delete context.hotkeyThrottle[hotkey.id]
            await context.doHotkey(hotkey)
        }
        assert.deepEqual(sent.slice(-2).map(command => [command.type, command.brightness]), [
            [expectedType, current + 10], [expectedType, current]
        ])
    }
    assert.equal(sent.length, 6)
})

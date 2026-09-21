const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const { getVolumeMaximum, scaleVolume, unscaleVolume } = require(path.join(root, 'src/volume-utils'))

test('misreported volume maximum can be overridden and cleared', () => {
    const feature = [30, 65535]
    assert.equal(scaleVolume(30, feature, { maxRawValue: 100 }), 30)
    assert.equal(unscaleVolume(30, feature, { maxRawValue: 100 }), 30)
    assert.equal(getVolumeMaximum(feature, {}), 65535)
    for (const maxRawValue of [0, -1, 65536, 1.5, '', 'invalid']) {
        assert.equal(getVolumeMaximum(feature, { maxRawValue }), 65535)
    }
    assert.equal(getVolumeMaximum([0, 0]), 100)
})

test('raw values round-trip through percentage and range limits', () => {
    for (const maximum of [100, 200, 65535]) {
        for (const range of [{ min: 0, max: 100 }, { min: 20, max: 80 }]) {
            const settings = { ...range, maxRawValue: maximum }
            for (const percent of [0, 25, 50, 75, 100]) {
                const raw = scaleVolume(percent, [0, 65535], settings)
                const expected = Math.round((range.min + percent * (range.max - range.min) / 100) * maximum / 100)
                assert.equal(raw, expected)
                assert.ok(Math.abs(unscaleVolume(raw, [raw, 65535], settings) - percent) <= 10000 / maximum / (range.max - range.min))
            }
        }
    }
    assert.equal(unscaleVolume(100, [100, 255], { maxRawValue: 200 }), 50)
    assert.equal(unscaleVolume(30, [30, 100], { min: 30, max: 30 }), 0)
})

// Execute the actual main-process functions with only OS/IPC effects stubbed.
const source = fs.readFileSync(path.join(root, 'src/electron.js'), 'utf8')
const ast = require(path.join(root, 'node_modules/@babel/parser')).parse(source, { sourceType: 'script', allowReturnOutsideFunction: true })
const names = ['applyLinkedFeatures', 'updateBrightness', 'normalizeBrightness']
const functions = ast.program.body.filter(n => n.type === 'FunctionDeclaration' && names.includes(n.id.name))
function createContext(featureSettings) {
    const messages = []
    const monitor = { id: 'DISPLAY#TEST#ONE', hwid: ['DISPLAY', 'TEST', 'ONE'], key: 'ONE', type: 'ddcci', min: 0, max: 100, features: { '0x62': [0, 65535] } }
    const context = {
        scaleVolume, Utils: require(path.join(root, 'src/Utils')),
        settings: { monitorFeaturesSettings: { TEST: { '0x62': featureSettings } }, monitorFeatures: { TEST: { '0x62': true } } },
        monitors: { ONE: monitor }, monitorsThread: { send: message => messages.push(message) },
        isWindowsUserIdle: false, currentTransition: null,
        usesExtendedMinimum: () => false, shouldSkipDisplay: () => false,
        setTrayPercent() {}, updateKnownDisplays() {},
        console: { log() {} }, debug: { error: (...args) => { throw new Error(args.join(' ')) } }
    }
    vm.createContext(context)
    vm.runInContext(functions.map(n => source.slice(n.start, n.end)).join('\n'), context)
    context.updateBrightnessThrottle = (id, value, cap, send, vcp) => context.updateBrightness(id, value, cap, vcp)
    return { context, monitor, messages }
}

test('volume slider writes raw values without clipping or double normalization', () => {
    for (const maximum of [100, 200, 65535]) {
        const settings = { min: 20, max: 80, maxRawValue: maximum }
        const { context, monitor, messages } = createContext(settings)
        const expected = scaleVolume(75, monitor.features['0x62'], settings)
        context.updateBrightness(monitor.id, expected, false, 'volume-raw')
        assert.equal(messages.length, 1)
        assert.equal(messages[0].code, 0x62)
        assert.equal(messages[0].value, expected)
        assert.equal(monitor.features['0x62'][0], expected)
    }
})

test('existing linked volume behavior is unchanged by the override', () => {
    const { context, monitor, messages } = createContext({ linked: true, maxVisual: 100, min: 20, max: 80, maxRawValue: 200 })
    context.applyLinkedFeatures(monitor, 50)
    assert.equal(messages[0].value, 50)
})

test('contrast and manual VCP requests retain their original normalization', () => {
    const { context, monitor, messages } = createContext({ min: 20, max: 80, maxRawValue: 200 })
    monitor.features['0x12'] = [0, 200]
    context.settings.monitorFeaturesSettings.TEST['0x12'] = { min: 20, max: 80 }
    context.updateBrightness(monitor.id, 25, false, 0x12)
    context.updateBrightness(monitor.id, 25, false, 0x62)
    assert.equal(messages[0].value, 35)
    assert.equal(messages[1].value, 35)
})

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const { getFeatureRawRange, scaleFeature, unscaleFeature } = require(path.join(root, 'src/feature-utils'))

test('Min/Max are percentages of the reported maximum', () => {
    assert.deepEqual(getFeatureRawRange([0, 100], {}), [0, 100])
    assert.deepEqual(getFeatureRawRange([0, 255], {}), [0, 255])
    assert.deepEqual(getFeatureRawRange([0, 200], { min: 20, max: 80 }), [40, 160])
    assert.deepEqual(getFeatureRawRange([0, 100], { min: 1, max: 2 }), [1, 2])
    // A maximum the display doesn't report is treated as 100
    assert.deepEqual(getFeatureRawRange([0, 0], { min: 1, max: 2 }), [1, 2])
    // Invalid ranges fall back to the whole range
    assert.deepEqual(getFeatureRawRange([0, 100], { min: 80, max: 20 }), [0, 100])
    assert.deepEqual(getFeatureRawRange([0, 100], { min: -5, max: 120 }), [0, 100])
})

test('a Min above 0 never sends 0, even when it rounds to less than one step', () => {
    for (const maximum of [2, 5, 11, 100, 255]) {
        for (const percent of [0, 1, 50, 99, 100]) {
            const raw = scaleFeature(percent, [0, maximum], { min: 1, max: 2 })
            assert.ok(raw >= 1, `maximum ${maximum}, ${percent}% sent ${raw}`)
        }
    }
})

test('slider values stay within Min and Max', () => {
    for (const maximum of [11, 100, 255, 65535]) {
        for (const range of [{ min: 0, max: 100 }, { min: 20, max: 80 }, { min: 9, max: 91 }]) {
            const [low, high] = getFeatureRawRange([0, maximum], range)
            assert.ok(low >= range.min * maximum / 100 && high <= range.max * maximum / 100)
            for (const percent of [0, 25, 50, 75, 100, -10, 150]) {
                const raw = scaleFeature(percent, [0, maximum], range)
                assert.ok(Number.isInteger(raw) && raw >= low && raw <= high)
            }
            assert.equal(scaleFeature(0, [0, maximum], range), low)
            assert.equal(scaleFeature(100, [0, maximum], range), high)
        }
    }
})

test('raw values round-trip through the slider percentage', () => {
    for (const maximum of [11, 100, 255]) {
        for (const range of [{ min: 0, max: 100 }, { min: 20, max: 80 }]) {
            const [low, high] = getFeatureRawRange([0, maximum], range)
            for (let raw = low; raw <= high; raw++) {
                assert.equal(scaleFeature(unscaleFeature(raw, [raw, maximum], range), [raw, maximum], range), raw)
            }
        }
    }
    assert.equal(unscaleFeature(50, [50, 100], { min: 30, max: 30 }), 0)
    assert.equal(unscaleFeature(undefined, [0, 100], {}), 0)
    assert.equal(unscaleFeature(500, [500, 255], {}), 100)
})

// Execute the actual main-process functions with only OS/IPC effects stubbed.
const source = fs.readFileSync(path.join(root, 'src/electron.js'), 'utf8')
const ast = require(path.join(root, 'node_modules/@babel/parser')).parse(source, { sourceType: 'script', allowReturnOutsideFunction: true })
const names = ['applyLinkedFeatures', 'updateBrightness', 'normalizeBrightness', 'settleFeatureReadings']
const functions = ast.program.body.filter(n => n.type === 'FunctionDeclaration' && names.includes(n.id.name))
function createContext(features, featureSettings) {
    const messages = []
    const monitor = { id: 'DISPLAY#TEST#ONE', hwid: ['DISPLAY', 'TEST', 'ONE'], key: 'ONE', type: 'ddcci', min: 0, max: 100, features }
    const enabled = Object.fromEntries(Object.keys(features).map(vcp => [vcp, true]))
    const context = {
        scaleVolume() { throw new Error('unexpected volume') }, scaleFeature, Utils: require(path.join(root, 'src/Utils')),
        settings: { monitorFeaturesSettings: { TEST: featureSettings }, monitorFeatures: { TEST: enabled } },
        monitors: { ONE: monitor }, monitorsThread: { send: message => messages.push(message) },
        isWindowsUserIdle: false, currentTransition: null,
        usesExtendedMinimum: () => false, shouldSkipDisplay: () => false, wasWrittenSince: () => false,
        setTrayPercent() {}, updateKnownDisplays() {}, recordMonitorWrite() {},
        console: { log() {} }, debug: { error: (...args) => { throw new Error(args.join(' ')) } }
    }
    vm.createContext(context)
    vm.runInContext(functions.map(n => source.slice(n.start, n.end)).join('\n'), context)
    context.updateBrightnessThrottle = (id, value, cap, send, vcp, raw) => context.updateBrightness(id, value, cap, vcp, true, raw)
    return { context, monitor, messages }
}

test('a custom feature slider at its far left sends Min, not 0 (#1371)', () => {
    const settings = { min: 1, max: 2 }
    const { context, monitor, messages } = createContext({ '0xDC': [3, 100] }, { '0xDC': settings })
    context.updateBrightness(monitor.id, scaleFeature(0, monitor.features['0xDC'], settings), false, 0xDC, true, true)
    context.updateBrightness(monitor.id, scaleFeature(100, monitor.features['0xDC'], settings), false, 0xDC, true, true)
    assert.deepEqual(messages.map(m => [m.code, m.value]), [[0xDC, 1], [0xDC, 2]])
    assert.equal(monitor.features['0xDC'][0], 2)
})

test('feature sliders write raw values without normalizing them again', () => {
    const settings = { min: 20, max: 80 }
    const { context, monitor, messages } = createContext({ '0x12': [0, 200], '0xE0': [0, 200] }, { '0x12': settings, '0xE0': settings })
    for (const vcp of [0x12, 0xE0]) {
        const raw = scaleFeature(25, [0, 200], settings)
        context.updateBrightness(monitor.id, raw, false, vcp, true, true)
        assert.equal(raw, 70)
        assert.equal(messages.at(-1).code, vcp)
        assert.equal(messages.at(-1).value, 70)
    }
})

test('linked features are scaled the same way as the feature sliders', () => {
    const settings = { linked: true, maxVisual: 100, min: 1, max: 2 }
    const contrast = { linked: true, maxVisual: 100, min: 20, max: 80 }
    const { context, monitor, messages } = createContext({ '0xDC': [3, 11], '0x12': [0, 200] }, { '0xDC': settings, '0x12': contrast })
    context.applyLinkedFeatures(monitor, 0)
    context.applyLinkedFeatures(monitor, 50)
    assert.deepEqual(messages.map(m => [m.code, m.value]), [
        [0xDC, scaleFeature(0, [0, 11], settings)], [0x12, 40],
        [0xDC, scaleFeature(50, [0, 11], settings)], [0x12, 100]
    ])
    assert.ok(messages.filter(m => m.code === 0xDC).every(m => m.value >= 1))
})

test('refreshed feature values stay raw', () => {
    const settings = { min: 20, max: 80 }
    const { context, monitor } = createContext({ '0x12': [150, 200], '0xDC': [3, 11] }, { '0x12': settings, '0xDC': settings })
    context.settleFeatureReadings(monitor, null, Date.now())
    assert.deepEqual(monitor.features, { '0x12': [150, 200], '0xDC': [3, 11] })
})

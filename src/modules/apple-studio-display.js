"use strict";

const { promisify } = require("util")

const BRIGHTNESS_MIN = 400.0
const BRIGHTNESS_MAX = 60000.0
const BRIGHTNESS_RANGE = BRIGHTNESS_MAX - BRIGHTNESS_MIN

const HID_REPORT_TYPE_FEATURE = 0x0300
const BRIGHTNESS_INTERFACE = 0x7
const REPORT_ID = 0x01
const REPORT_GET = 0x01
const REPORT_SET = 0x09
const DIRECTION_IN = 1 << 7
const DIRECTION_OUT = 0 << 7
const REQUEST_TYPE_CLASS = 1 << 5
const REQUEST_RECIPIENT_INTERFACE = 1

const VENDOR_ID = 0x05ac
const PRODUCT_NAMES = {
    0x1114: "Apple Studio Display",
    0x1116: "Apple Studio Display XDR"
}

let usb = false
let usbLoadError = false
let usbLoadErrorLogged = false
let usbHelpers = false

try {
    usb = require("usb")
} catch (error) {
    usbLoadError = error
}

function getUSBHelpers() {
    if (usbHelpers) return usbHelpers

    if (!usb) {
        if (usbLoadError && !usbLoadErrorLogged) {
            console.log("\x1b[41m" + "apple-studio-display: failed to access usb" + "\x1b[0m", usbLoadError)
            usbLoadErrorLogged = true
        }
        return false
    }

    usbHelpers = {
        getDeviceList: usb.getDeviceList,
        devControlTransfer: promisify(usb.Device.prototype.controlTransfer),
        devGetStringDesc: promisify(usb.Device.prototype.getStringDescriptor),
        ifaceRelease: promisify(usb.Interface.prototype.release)
    }
    return usbHelpers
}

function isSupportedProductId(productId) {
    return Object.prototype.hasOwnProperty.call(PRODUCT_NAMES, productId)
}

function getDisplayModelName(productId) {
    return PRODUCT_NAMES[productId] || "Apple Studio Display"
}

function getDisplays() {
    const helpers = getUSBHelpers()
    if (!helpers) return []

    const displays = []
    for (const device of helpers.getDeviceList()) {
        const desc = device.deviceDescriptor
        if (desc.idVendor === VENDOR_ID && isSupportedProductId(desc.idProduct)) {
            displays.push(new AppleStudioDisplay(device, desc.idProduct))
        }
    }
    return displays
}

class AppleStudioDisplay {
    constructor(device, productId) {
        this._device = device
        this._productId = productId
        this._queue = 0
        this._open = null
        this._claimed = null
    }

    getModelName() {
        return getDisplayModelName(this._productId)
    }

    async getBrightness() {
        const response = await this._guard(() =>
            controlTransfer(this._device, DIRECTION_IN, REPORT_GET, 7)
        )
        return nitsToPercent(response.readUInt16LE(1))
    }

    async setBrightness(percent) {
        if (percent < 0 || percent > 100) throw new Error('expected percent within range [0, 100]')

        const data = makeRequestData(percentToNits(percent))
        await this._guard(() =>
            controlTransfer(this._device, DIRECTION_OUT, REPORT_SET, data)
        )
    }

    async getSerialNumber() {
        return this._guard(() => {
            const helpers = getUSBHelpers()
            if (!helpers) throw new Error("usb unavailable")
            const desc = this._device.deviceDescriptor
            return helpers.devGetStringDesc.call(this._device, desc.iSerialNumber)
        })
    }

    async _guard(fn) {
        try {
            this._enter()
            return await fn()
        } finally {
            await this._exit()
        }
    }

    _enter() {
        const display = this._device
        this._queue++
        if (!this._open) {
            display.open()
            this._open = display
        }
        if (!this._claimed) {
            const iface = display.interface(BRIGHTNESS_INTERFACE)
            iface.claim()
            this._claimed = iface
        }
        return display
    }

    async _exit() {
        if (--this._queue === 0) {
            const helpers = getUSBHelpers()
            try {
                if (this._claimed && helpers) {
                    await helpers.ifaceRelease.call(this._claimed)
                    if (this._queue > 0) return
                    this._claimed = null
                }
            } catch (e) {
                console.log("failed to release Studio Display interface", e)
            }

            try {
                this._open?.close()
                this._open = null
            } catch (e) {
                console.log("failed to close Studio Display device", e)
            }
        }
    }
}

function controlTransfer(display, direction, report, data) {
    const helpers = getUSBHelpers()
    if (!helpers) throw new Error("usb unavailable")

    return helpers.devControlTransfer.call(
        display,
        makeRequestType(direction),
        report,
        HID_REPORT_TYPE_FEATURE | REPORT_ID,
        BRIGHTNESS_INTERFACE,
        data,
    )
}

function makeRequestType(direction) {
    return direction | REQUEST_TYPE_CLASS | REQUEST_RECIPIENT_INTERFACE
}

function makeRequestData(nits) {
    const bytes = Buffer.alloc(7)
    bytes[0] = REPORT_ID
    bytes.writeUInt16LE(nits, 1)
    return bytes
}

function percentToNits(percent) {
    const factor = percent / 100.0
    const scaled = BRIGHTNESS_RANGE * factor
    return BRIGHTNESS_MIN + scaled
}

function nitsToPercent(nits) {
    const scaled = nits - BRIGHTNESS_MIN
    const factor = scaled / BRIGHTNESS_RANGE
    return factor * 100.0
}

module.exports = {
    getDisplays
}

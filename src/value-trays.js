// Keeps a tray icon per DDC/CI value, like ClickMonitorDDC did: the main
// Twinkle Tray icon becomes a brightness readout, and a second icon is added
// for contrast. Each icon shows its value and scrolls only its own feature.
//
// The manager does not own the main icon. electron.js keeps creating it; this
// class only hands it the image to show, so everything falls back to the stock
// icon when the feature is off.

const { Menu, Tray, nativeImage } = require("electron")
const { renderIcon, formatValue, SCALES } = require("./tray-icons")
const { scaleFeature, unscaleFeature } = require("./feature-utils")

const CONTRAST_VCP = "0x12"
const CONTRAST_CODE = parseInt(CONTRAST_VCP)
const ADJUSTABLE_TYPES = ["ddcci", "wmi", "studio-display", "software"]
const REFRESH_DELAY = 120

function inBounds(bounds, x, y) {
    if (!bounds) return false
    return (x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height)
}

function clampPercent(value) {
    const number = Math.round(Number(value))
    if (!Number.isFinite(number)) return 0
    return Math.min(100, Math.max(0, number))
}

class ValueTrayManager {
    constructor(dependencies = {}) {
        this.deps = dependencies
        this.contrastTray = null
        this.contrastBounds = null
        // Last drawn state per icon, so a redraw only happens on a real change
        this.painted = { brightness: null, contrast: null }
        this.refreshTimer = false
        this.refreshForce = false
        this.lastHover = 0
    }

    settings() {
        return (this.deps.getSettings?.() || {})
    }

    config() {
        return (this.settings().valueTrayIcons || {})
    }

    enabled() {
        return (this.config().enabled === true)
    }

    showLabels() {
        return (this.config().showLabels !== false)
    }

    theme() {
        return (this.deps.isLightTheme?.() ? "light" : "dark")
    }

    monitors() {
        return (this.deps.getMonitors?.() || {})
    }

    isAdjustable(monitor) {
        if (!monitor || monitor.type === "none") return false
        if (!ADJUSTABLE_TYPES.includes(monitor.type)) return false
        return Number.isFinite(Number(monitor.brightness))
    }

    // The display the icons follow. A configured display that is unplugged
    // falls back to the first DDC/CI one, so the icons don't vanish.
    monitor() {
        if (!this.enabled()) return null
        const list = Object.values(this.monitors()).filter(monitor => this.isAdjustable(monitor))
        const monitorId = this.config().monitorId
        if (monitorId) {
            const configured = list.find(monitor => monitor.id === monitorId)
            if (configured) return configured
        }
        return (list.find(monitor => monitor.type === "ddcci") || null)
    }

    featureSettings(monitor, vcp = CONTRAST_VCP) {
        return this.settings().monitorFeaturesSettings?.[monitor?.hwid?.[1]]?.[vcp]
    }

    contrastFeature(monitor) {
        const feature = monitor?.features?.[CONTRAST_VCP]
        return (Array.isArray(feature) ? feature : null)
    }

    supportsContrast(monitor) {
        return !!this.contrastFeature(monitor)
    }

    wantsContrast(monitor) {
        if (this.config().items?.contrast === false) return false
        return this.supportsContrast(monitor)
    }

    // Contrast is edited in percent, and the raw value is what the monitor
    // reports, so the conversion matches the flyout's slider.
    contrastPercent(monitor) {
        const feature = this.contrastFeature(monitor)
        if (!feature) return null
        return clampPercent(unscaleFeature(feature[0] ?? 0, feature, this.featureSettings(monitor)))
    }

    displayName(monitor) {
        try {
            const name = this.settings().names?.[monitor.id]
            return (name || monitor.name || "Display")
        } catch (e) {
            return "Display"
        }
    }

    imageFor(value, label) {
        const theme = this.theme()
        const base = renderIcon({ value, label, theme, scale: 1 })
        const image = nativeImage.createFromBitmap(base.buffer, {
            width: base.width,
            height: base.height,
            scaleFactor: 1
        })

        // Windows picks the representation that matches the display scaling
        for (const scale of SCALES) {
            if (scale === 1) continue
            const representation = renderIcon({ value, label, theme, scale })
            image.addRepresentation({
                scaleFactor: scale,
                width: representation.width,
                height: representation.height,
                buffer: representation.buffer
            })
        }

        return image
    }

    paintKey(value, label) {
        return `${formatValue(value)}|${label}|${this.theme()}`
    }

    paintBrightness(monitor, force = false) {
        const label = (this.showLabels() ? "B" : "")
        const key = this.paintKey(monitor.brightness, label)
        if (!force && this.painted.brightness === key) return false

        this.painted.brightness = key
        this.deps.setMainImage?.(this.imageFor(monitor.brightness, label))
        return true
    }

    contrastTooltip(monitor) {
        const percent = this.contrastPercent(monitor)
        const name = this.displayName(monitor)
        const label = (this.deps.t?.("PANEL_LABEL_CONTRAST") || "Contrast")
        return `${label} ${percent === null ? "--" : percent + "%"} \u2014 ${name}`
    }

    paintContrast(monitor, force = false) {
        if (!this.wantsContrast(monitor)) {
            this.destroyContrastTray()
            return false
        }

        // The first refresh can arrive before the display list is populated,
        // so the icon is created here as well as in sync().
        if (!this.contrastTray) return this.createContrastTray(monitor)

        const label = (this.showLabels() ? "C" : "")
        const percent = this.contrastPercent(monitor)
        const key = this.paintKey(percent, label)

        if (force || this.painted.contrast !== key) {
            this.painted.contrast = key
            try {
                this.contrastTray.setImage(this.imageFor(percent, label))
                this.contrastTray.setToolTip(this.contrastTooltip(monitor))
                if (force) this.setContrastMenu(monitor)
            } catch (e) {
                console.log("Couldn't update the contrast tray icon", e)
            }
        }
        return true
    }

    createContrastTray(monitor) {
        if (this.contrastTray) return true
        try {
            const label = (this.showLabels() ? "C" : "")
            const percent = this.contrastPercent(monitor)
            this.painted.contrast = this.paintKey(percent, label)

            this.contrastTray = new Tray(this.imageFor(percent, label))
            this.contrastTray.setToolTip(this.contrastTooltip(monitor))
            this.contrastTray.on("click", () => this.deps.onOpenPanel?.())
            this.contrastTray.on("mouse-move", () => this.trackContrastBounds())
            this.setContrastMenu(monitor)
            console.log("Created contrast tray icon")
            return true
        } catch (e) {
            console.log("Couldn't create the contrast tray icon", e)
            this.contrastTray = null
            return false
        }
    }

    setContrastMenu(monitor) {
        if (!this.contrastTray) return false
        try {
            const template = [
                { label: "50%", click: () => this.setContrastTo(monitor, 50) },
                { label: "100%", click: () => this.setContrastTo(monitor, 100) },
                { type: "separator" },
                { label: this.deps.t?.("GENERIC_SETTINGS"), click: () => this.deps.onOpenSettings?.() },
                { label: this.deps.t?.("GENERIC_REFRESH_DISPLAYS"), click: () => this.deps.onRefreshDisplays?.() }
            ]
            this.contrastTray.setContextMenu(Menu.buildFromTemplate(template))
            return true
        } catch (e) {
            console.log("Couldn't build the contrast tray menu", e)
            return false
        }
    }

    // The contrast icon reports its own position; the global mouse hook needs
    // it to know which icon the wheel is over. The position is always fresh,
    // while the hover side effects (a refresh, resuming the mouse hook) are
    // throttled like the main icon's.
    trackContrastBounds() {
        if (!this.contrastTray) return null
        try {
            this.contrastBounds = require("electron").screen.dipToScreenRect(null, this.contrastTray.getBounds())
        } catch (e) {
            this.contrastBounds = null
        }

        const now = Date.now()
        if (this.lastHover + 500 > now) return this.contrastBounds
        this.lastHover = now
        this.deps.onTrayHover?.()
        return this.contrastBounds
    }

    destroyContrastTray() {
        if (!this.contrastTray) return false
        try {
            this.contrastTray.removeAllListeners?.()
            this.contrastTray.destroy()
        } catch (e) {
            console.log("Couldn't destroy the contrast tray icon", e)
        }
        this.contrastTray = null
        this.contrastBounds = null
        this.painted.contrast = null
        return true
    }

    // Creates or removes icons so they match the settings and the display
    sync() {
        const monitor = this.monitor()

        if (!monitor) {
            this.destroyContrastTray()
            this.painted.brightness = null
            this.deps.setStaticMainIcon?.()
            return false
        }

        this.paintBrightness(monitor, true)

        if (this.wantsContrast(monitor)) {
            if (!this.contrastTray) this.createContrastTray(monitor)
            else this.paintContrast(monitor, true)
        } else {
            this.destroyContrastTray()
        }

        return true
    }

    // Called wherever the app already refreshes its tray tooltip, so every
    // brightness change (wheel, hotkey, flyout, schedule, idle) lands here.
    refresh(force = false) {
        if (!this.enabled()) return false
        this.refreshForce = (this.refreshForce || force)

        if (this.refreshTimer) return true
        this.refreshTimer = setTimeout(() => {
            const forceNow = this.refreshForce
            this.refreshTimer = false
            this.refreshForce = false
            this.paintNow(forceNow)
        }, REFRESH_DELAY)

        return true
    }

    paintNow(force = false) {
        const monitor = this.monitor()

        if (!monitor) {
            this.destroyContrastTray()
            this.painted.brightness = null
            this.deps.setStaticMainIcon?.()
            return false
        }

        this.paintBrightness(monitor, force)
        this.paintContrast(monitor, force)
        return true
    }

    // Gives the main icon its live value. Returns false so the caller can fall
    // back to the stock icon file.
    applyMainTrayIcon(force = false) {
        const monitor = this.monitor()
        if (!monitor) return false
        this.paintBrightness(monitor, force)
        return true
    }

    stepFor(delta) {
        const amount = Number(this.settings().scrollShortcutAmount)
        return delta * (Number.isFinite(amount) ? amount : 0)
    }

    adjustBrightness(monitor, delta) {
        const step = this.stepFor(delta)
        if (!step) return false

        const current = clampPercent(monitor.brightness)
        const next = Math.min(100, Math.max(0, Math.round(current + step)))
        if (next === current) return false

        this.deps.setBrightness?.(monitor, next)
        this.refresh()
        return true
    }

    adjustContrast(monitor, delta) {
        const step = this.stepFor(delta)
        if (!step) return false

        const current = this.contrastPercent(monitor)
        if (current === null) return false

        const next = Math.min(100, Math.max(0, Math.round(current + step)))
        if (next === current) return false

        return this.setContrastTo(monitor, next)
    }

    setContrastTo(monitor, percent) {
        const feature = this.contrastFeature(monitor)
        if (!feature) return false

        const raw = scaleFeature(percent, feature, this.featureSettings(monitor))
        if (!Number.isFinite(raw)) return false

        // Update the cached value now so the icon follows the wheel immediately
        feature[0] = raw
        this.deps.setVcp?.(monitor, CONTRAST_CODE, raw, true)
        this.refresh()
        return true
    }

    // Returns true when the wheel was over one of the value icons, so the
    // caller skips its own all-monitors scroll shortcut. Being over an icon
    // always consumes the wheel, even at the end of its range, so a display at
    // 100% never falls through to changing every display.
    handleWheel(delta, x, y, mainBounds) {
        if (!this.enabled() || !delta) return false

        const monitor = this.monitor()
        if (!monitor) return false

        if (this.contrastTray && inBounds(this.contrastBounds, x, y)) {
            this.adjustContrast(monitor, delta)
            return true
        }

        if (inBounds(mainBounds, x, y)) {
            this.adjustBrightness(monitor, delta)
            return true
        }

        return false
    }

    destroy() {
        if (this.refreshTimer) clearTimeout(this.refreshTimer)
        this.refreshTimer = false
        this.refreshForce = false
        this.destroyContrastTray()
    }
}

module.exports = { ValueTrayManager, CONTRAST_VCP, CONTRAST_CODE }

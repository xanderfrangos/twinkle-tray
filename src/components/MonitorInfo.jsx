import React, { useState } from "react"
import Slider from "./Slider"

export default function MonitorInfo(props) {
    const { monitor, name } = props
    const [brightness, setBrightness] = useState(monitor?.features?.["0x10"] ? monitor?.features?.["0x10"][0] : 50)
    const [contrast, setContrast] = useState(monitor?.features?.["0x12"] ? monitor?.features?.["0x12"][0] : 50)
    const [volume, setVolume] = useState(monitor?.features?.["0x62"] ? monitor?.features?.["0x62"][0] : 50)
    const [powerState, setPowerState] = useState(monitor?.features?.["0xD6"] ? monitor?.features?.["0xD6"][0] : 50)
    const [sdr, setSDR] = useState(monitor.sdrLevel >= 0 ? monitor.sdrLevel : 50)
    const [manualVCP, setManualVCP] = useState("")
    const [manualValue, setManualValue] = useState("")

    let extraHTML = []

    if (props.debug === true) {
        extraHTML.push(
            <div key="debug">
                <br />Raw Brightness: <b>{(monitor.type == "none" ? "Not supported" : monitor.brightnessRaw)}</b>
                <br />Features: <b>{(monitor.type == "ddcci" && monitor.features ? JSON.stringify(monitor.features) : "Unsupported")}</b>
                <br />Order: <b>{(monitor.order ? monitor.order : "0")}</b>
                <br />Key: <b>{monitor.key}</b>
                <br />ID: <b>{monitor.id}</b>
                <br />Connection Type: <b>{monitor.connector}</b>
                <br /><br />
            </div>
        )
    }

    // Brightness
    if (monitor?.features?.["0x10"]) {
        extraHTML.push(
            <div className="feature-row" key="brightness">
                <div className="feature-icon"><span className="icon vfix">&#xE706;</span></div>
                <Slider type="brightness" monitorID={monitor.id} level={brightness} monitorName={monitor.name} monitortype={monitor.type} onChange={val => { setBrightness(val); setVCP(monitor.id, 0x10, val * (monitor.features["0x10"][1] / 100)) }} scrolling={false} />
            </div>
        )
    }

    // Contrast
    if (monitor?.features?.["0x12"]) {
        extraHTML.push(
            <div className="feature-row" key="contrast">
                <div className="feature-icon"><span className="icon vfix">&#xE793;</span></div>
                <Slider type="contrast" monitorID={monitor.id} level={contrast} monitorName={monitor.name} monitortype={monitor.type} onChange={val => { setContrast(val); setVCP(monitor.id, 0x12, val * (monitor.features["0x12"][1] / 100)) }} scrolling={false} />
            </div>
        )
    }

    // Volume
    if (monitor?.features?.["0x62"]) {
        extraHTML.push(
            <div className="feature-row" key="volume">
                <div className="feature-icon"><span className="icon vfix">&#xE767;</span></div>
                <Slider type="volume" monitorID={monitor.id} level={volume} monitorName={monitor.name} monitortype={monitor.type} onChange={val => { setVolume(val); setVCP(monitor.id, 0x62, val * (monitor.features["0x62"][1] / 100)) }} scrolling={false} />
            </div>
        )
    }

    // Power State
    if (monitor?.features?.["0xD6"]) {
        extraHTML.push(
            <div className="feature-row" key="powerState">
                <div className="feature-icon"><span className="icon vfix">&#xE7E8;</span></div>
                <Slider type="powerState" monitorID={monitor.id} level={powerState} monitorName={monitor.name} max={monitor.features["0xD6"][1]} monitortype={monitor.type} onChange={val => { setPowerState(val); setVCP(monitor.id, 0xD6, val) }} scrolling={false} />
            </div>
        )
    }

    // Manual VCP
    extraHTML.push(
        <div className="manual-vcp-row" key="manual">
            <input placeholder="VCP code" value={manualVCP} onChange={e => { setManualVCP(e.target.value) }} />
            <input placeholder="Value" value={manualValue} onChange={e => { setManualValue(e.target.value) }} />
            <a className="button" onClick={() => setVCP(monitor.id, parseInt(manualVCP), parseInt(manualValue))}>Send VCP</a>
        </div>
    )

    // SDR test
    extraHTML.push(
        <div className="feature-row" key="sdrLevel">
            <div className="feature-icon">SDR</div>
            <Slider type="sdrLevel" monitorID={monitor.id} level={sdr} monitorName={monitor.name} max={100} monitortype={monitor.type} onChange={val => { setSDR(val); setSDRBrightness(monitor.id, val) }} scrolling={false} />
        </div>
    )

    return (
        <div key={monitor.key}>
            <br />
            <div className="sectionSubtitle"><div className="icon">&#xE7F4;</div><div>{monitor.name}</div></div>
            <p>{T.t("SETTINGS_MONITORS_DETAILS_NAME")}: <b>{name}</b>
                <br />{T.t("SETTINGS_MONITORS_DETAILS_INTERNAL_NAME")}: <b>{monitor.hwid[1]}</b>
                <br />{T.t("SETTINGS_MONITORS_DETAILS_COMMUNICATION")}: {getDebugMonitorType((monitor.type === "ddcci" && monitor.highLevelSupported?.brightness ? "ddcci-hl" : monitor.type))}
                <br />{T.t("SETTINGS_MONITORS_DETAILS_BRIGHTNESS")}: <b>{(monitor.type == "none" ? T.t("GENERIC_NOT_SUPPORTED") : monitor.brightness)}</b>
                <br />{T.t("SETTINGS_MONITORS_DETAILS_MAX_BRIGHTNESS")}: <b>{(monitor.type !== "ddcci" ? T.t("GENERIC_NOT_SUPPORTED") : monitor.brightnessMax)}</b>
                <br />{T.t("SETTINGS_MONITORS_DETAILS_BRIGHTNESS_NORMALIZATION")}: <b>{(monitor.type == "none" ? T.t("GENERIC_NOT_SUPPORTED") : monitor.min + " - " + monitor.max)}</b>
                <br />{T.t("SETTINGS_MONITORS_DETAILS_HDR")}: <b>{(monitor.hdr == "active" ? T.t("GENERIC_ACTIVE") : monitor.hdr == "supported" ? T.t("GENERIC_SUPPORTED") : T.t("GENERIC_UNSUPPORTED"))}</b>
            </p>
            {extraHTML}
        </div>
    )
}

function setVCP(monitor, code, value) {
    window.dispatchEvent(new CustomEvent("setVCP", {
        detail: {
            monitor,
            code,
            value
        }
    }))
}

function setSDRBrightness(monitor, value) {
    window.dispatchEvent(new CustomEvent("set-sdr-brightness", {
        detail: {
            monitor,
            value
        }
    }))
}

function getDebugMonitorType(type) {
    if (type == "none") {
        return (<><b>None</b> <span className="icon red vfix">&#xEB90;</span></>)
    } else if (type == "ddcci") {
        return (<><b>DDC/CI</b> <span className="icon green vfix">&#xE73D;</span></>)
    } else if (type == "ddcci-hl") {
        return (<><b>DDC/CI (HL)</b> <span className="icon green vfix">&#xE73D;</span></>)
    } else if (type == "wmi") {
        return (<><b>WMI</b> <span className="icon green vfix">&#xE73D;</span></>)
    } else if (type == "studio-display") {
        return (<><b>Studio Display</b> <span className="icon green vfix">&#xE73D;</span></>)
    } else {
        return (<><b>Unknown ({type})</b> <span className="icon red vfix">&#xEB90;</span></>)
    }
}

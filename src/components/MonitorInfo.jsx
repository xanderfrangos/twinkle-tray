import React, { useState } from "react"
import Slider from "./Slider"

export default function MonitorInfo(props) {
    const { monitor, name } = props
    const [contrast, setContrast] = useState(monitor?.features?.contrast ? monitor?.features?.contrast[0] : 50)
    const [volume, setVolume] = useState(monitor?.features?.volume ? monitor?.features?.volume[0] : 50)
    const [powerState, setPowerState] = useState(monitor?.features?.powerState ? monitor?.features?.powerState[0] : 50)

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

    if (monitor?.features?.contrast) {
        extraHTML.push(
            <div className="feature-row" key="contrast">
                <div className="feature-icon"><span className="icon vfix">&#xE793;</span></div>
                <Slider type="contrast" monitorID={monitor.id} level={contrast} monitorName={monitor.name} monitortype={monitor.type} onChange={val => { setContrast(val); setVCP(monitor.id, 0x12, val * (monitor.features.contrast[1] / 100)) }} scrolling={false} />
            </div>
        )
    }

    if (monitor?.features?.volume) {
        extraHTML.push(
            <div className="feature-row" key="volume">
                <div className="feature-icon"><span className="icon vfix">&#xE767;</span></div>
                <Slider type="volume" monitorID={monitor.id} level={volume} monitorName={monitor.name} monitortype={monitor.type} onChange={val => { setVolume(val); setVCP(monitor.id, 0x62, val * (monitor.features.volume[1] / 100)) }} scrolling={false} />
            </div>
        )
    }

    if (monitor?.features?.powerState) {
        extraHTML.push(
            <div className="feature-row" key="powerState">
                <div className="feature-icon"><span className="icon vfix">&#xE7E8;</span></div>
                <Slider type="powerState" monitorID={monitor.id} level={powerState} monitorName={monitor.name} max={monitor.features.powerState[1]} monitortype={monitor.type} onChange={val => { setPowerState(val); setVCP(monitor.id, 0xD6, val) }} scrolling={false} />
            </div>
        )
    }

    return (
        <div key={monitor.key}>
            <br />
            <div className="sectionSubtitle"><div className="icon">&#xE7F4;</div><div>{monitor.name}</div></div>
            <p>Name: <b>{name}</b>
                <br />Internal name: <b>{monitor.hwid[1]}</b>
                <br />Communication Method: {getDebugMonitorType((monitor.type === "ddcci" && monitor.highLevelSupported?.brightness ? "ddcci-hl" : monitor.type))}
                <br />Current Brightness: <b>{(monitor.type == "none" ? "Not supported" : monitor.brightness)}</b>
                <br />Max Brightness: <b>{(monitor.type !== "ddcci" ? "Not supported" : monitor.brightnessMax)}</b>
                <br />Brightness Normalization: <b>{(monitor.type == "none" ? "Not supported" : monitor.min + " - " + monitor.max)}</b>
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
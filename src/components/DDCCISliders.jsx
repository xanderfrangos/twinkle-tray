import React, { useState } from "react"
import Slider from "./Slider"

export default function DDCCISliders(props) {
    const { monitor, name, monitorFeatures } = props
    const [contrast, setContrast] = useState(monitor.features.contrast ? monitor.features.contrast[0] : 50)
    const [volume, setVolume] = useState(monitor.features.volume ? monitor.features.volume[0] : 50)
    const [gain, setGain] = useState(50)
    const [powerState, setPowerState] = useState(monitor.features.powerState ? monitor.features.powerState[0] : 50)

    let extraHTML = []

    if (monitor.features.contrast && monitorFeatures?.contrast) {
        extraHTML.push(
            <div className="feature-row">
                <div className="feature-icon"><span className="icon vfix">&#xE793;</span></div>
                <Slider type="contrast" monitorID={monitor.id} level={contrast} monitorName={monitor.name} monitortype={monitor.type} onChange={val => { setContrast(val); setVCP(monitor.id, 0x12, val * (monitor.features.contrast[1] / 100)) }} scrolling={false} />
            </div>
        )
    }

    if (monitor.features.gain && monitorFeatures?.gain) {
        extraHTML.push(
            <div className="feature-row">
                <div className="feature-icon"><span className="icon vfix">&#xE9CA;</span></div>
                <Slider type="gain" monitorID={monitor.id} level={gain} monitorName={monitor.name} monitortype={monitor.type} onChange={val => { setGain(val); }} scrolling={false} />
            </div>
        )
    }

    if (monitor.features.volume && monitorFeatures?.volume) {
        extraHTML.push(
            <div className="feature-row">
                <div className="feature-icon"><span className="icon vfix">&#xE767;</span></div>
                <Slider type="volume" monitorID={monitor.id} level={volume} monitorName={monitor.name} monitortype={monitor.type} onChange={val => { setVolume(val); setVCP(monitor.id, 0x62, val * (monitor.features.volume[1] / 100)) }} scrolling={false} />
            </div>
        )
    }

    return (
        <>
        {extraHTML}
        </>
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
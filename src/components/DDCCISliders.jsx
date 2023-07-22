import React, { useState } from "react"
import Slider from "./Slider"

export default function DDCCISliders(props) {
    const { monitor, name, monitorFeatures } = props
    const [contrast, setContrast] = useState(monitor?.features?.["0x12"] ? monitor?.features?.["0x12"][0] : 50)
    const [volume, setVolume] = useState(monitor?.features?.["0x62"] ? monitor?.features?.["0x62"][0] : 50)

    let extraHTML = []

    if (monitor?.features?.["0x12"] && monitorFeatures?.["0x12"]) {
        extraHTML.push(
            <div className="feature-row feature-contrast" key={monitor.key + "_contrast"}>
                <div className="feature-icon"><span className="icon vfix">&#xE793;</span></div>
                <Slider type="contrast" monitorID={monitor.id} level={contrast} monitorName={monitor.name} monitortype={monitor.type} onChange={val => { setContrast(val); setVCP(monitor.id, 0x12, val * (monitor.features["0x12"][1] / 100)) }} />
            </div>
        )
    }

    if (monitor?.features?.["0x62"] && monitorFeatures?.["0x62"]) {
        extraHTML.push(
            <div className="feature-row feature-volume" key={monitor.key + "_volume"}>
                <div className="feature-icon"><span className="icon vfix">&#xE767;</span></div>
                <Slider type="volume" monitorID={monitor.id} level={volume} monitorName={monitor.name} monitortype={monitor.type} onChange={val => { setVolume(val); setVCP(monitor.id, 0x62, val * (monitor.features["0x62"][1] / 100)) }} />
            </div>
        )
    }

    if (monitor?.customFeatures?.length) {
        let i = 0
        for(const feature of monitor?.customFeatures) {
            i++
            extraHTML.push(
                <div className="feature-row feature-custom" key={monitor.key + "_custom" + i}>
                    <div className="feature-icon"><span className="icon vfix">&#xE767;</span></div>
                    <Slider type="volume" monitorID={monitor.id} level={volume} monitorName={monitor.name} monitortype={monitor.type} onChange={val => { setVolume(val); setVCP(monitor.id, 0x62, val * (monitor.features.volume[1] / 100)) }} />
                </div>
            )
        }
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
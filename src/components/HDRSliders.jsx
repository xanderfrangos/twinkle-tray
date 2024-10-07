import React, { useState } from "react"
import { useObject } from "../hooks/useObject"
import Slider from "./Slider"

export default function HDRSliders(props) {
    const { monitor, name, hdrFeatures } = props
    const [sdrLevel, setSDRLevel] = useState(monitor?.sdrLevel)

    let extraHTML = []

    // SDR Brightness
    extraHTML.push(
        <div className="feature-row feature-sdr" key={monitor.key + "_sdr"}>
            <div className="feature-icon"><span className="text vfix">SDR</span></div>
            <Slider type="sdr" monitorID={monitor.id} level={sdrLevel} monitorName={monitor.name} monitortype={monitor.type} onChange={val => { setSDRLevel( val ); setSDRBrightness(monitor.id, parseInt(val)) }} scrollAmount={props.scrollAmount} />
        </div>
    )

    return (
        <>
        {extraHTML}
        </>
    )
}

function setSDRBrightness(monitor, code, value) {
    window.dispatchEvent(new CustomEvent("set-sdr-brightness", {
        detail: {
            monitor,
            value
        }
    }))
}
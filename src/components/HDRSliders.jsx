import React, { useEffect, useState } from "react"
import Slider from "./Slider"

export default function HDRSliders(props) {
    const { monitor } = props
    const [sdrLevel, setSDRLevel] = useState(monitor?.sdrLevel)
    useEffect(() => { setSDRLevel(monitor?.sdrLevel) }, [monitor?.sdrLevel])

    if (monitor?.hdr !== "active") return null;

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

function setSDRBrightness(monitor, value) {
    window.ipc.send("set-sdr-brightness", { monitor, value })
}

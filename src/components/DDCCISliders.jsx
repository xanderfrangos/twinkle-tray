import React from "react"
import { useObject } from "../hooks/useObject"
import Slider from "./Slider"

export default function DDCCISliders(props) {
    const { monitor, monitorFeatures } = props

    const defaultValues = {}

    for (const vcp in monitor?.features) {
        defaultValues[vcp] = vcp === "0x60"
            ? monitor?.features?.[vcp] ?? 0
            : monitor?.features?.[vcp]?.[0] ?? 0
    }
    const [values, setValues] = useObject(defaultValues)

    const inputsData = {
        1: "VGA-1",
        2: "VGA-2",
        3: "DVI-1",
        4: "DVI-2",
        5: "Composite video 1",
        6: "Composite video 2",
        7: "S-Video-1",
        8: "S-Video-2",
        9: "Tuner-1",
        10: "Tuner-2",
        11: "Tuner-3",
        12: "Component video (YPrPb/YCrCb) 1",
        13: "Component video (YPrPb/YCrCb) 2",
        14: "Component video (YPrPb/YCrCb) 3",
        15: "DisplayPort-1",
        16: "DisplayPort-2",
        17: "HDMI-1",
        18: "HDMI-2"
    }

    const changeInputsState = (code) => {
        const a = [code, [...values["0x60"][1]]]
        setValues({ ["0x60"]: a })
    }

    let extraHTML = []
    const featureSettings = window.settings?.monitorFeaturesSettings?.[monitor?.hwid[1]]

    if (monitor?.features) {
        let i = 0
        for (const vcp in monitor.features) {
            i++

            if (vcp == "0x10" || vcp == "0x13" || vcp == "0xD6") {
                continue; // Skip if brightness or power state
            }

            const feature = monitor.features[vcp]
            if (feature && monitorFeatures?.[vcp] && !(featureSettings?.[vcp]?.linked)) {
                // Feature has a value, is enabled, and not linked
                if (vcp === "0x12") {
                    // Contrast
                    extraHTML.push(
                        <div className="feature-row feature-contrast" key={monitor.key + "_" + vcp}>
                            <div className="feature-icon"><span className="icon vfix">&#xE793;</span></div>
                            <Slider type="contrast" monitorID={monitor.id} level={values[vcp]} monitorName={monitor.name} monitortype={monitor.type} onChange={val => { setValues({ [vcp]: val }); setVCP(monitor.id, parseInt(vcp), val * (monitor.features[vcp][1] / 100)) }} scrollAmount={props.scrollAmount} />
                        </div>
                    )
                } else if (vcp === "0x62") {
                    // Volume
                    extraHTML.push(
                        <div className="feature-row feature-volume" key={monitor.key + "_" + vcp}>
                            <div className="feature-icon"><span className="icon vfix">&#xE767;</span></div>
                            <Slider type="volume" monitorID={monitor.id} level={values[vcp]} monitorName={monitor.name} monitortype={monitor.type} onChange={val => { setValues({ [vcp]: val }); setVCP(monitor.id, parseInt(vcp), val * (monitor.features[vcp][1] / 100)) }} scrollAmount={props.scrollAmount} />
                        </div>
                    )
                } else if (vcp === "0x60") {
                    extraHTML.push(
                        <div className="feature-row feature-inputs" key={monitor.key + "_" + vcp}>
                            <div className="feature-icon"><span className="icon vfix">&#xE839;</span></div>
                            <div style={{ display: "flex", flexWrap: 'wrap' }}>
                                {values["0x60"][1].map(e =>
                                    <div key={e + monitor.id}><button className={values["0x60"][0] === e ? "button disabled" : "button"}  disabled={values["0x60"][0] === e} onClick={() => { setVCP(monitor.id, parseInt(vcp), e); changeInputsState(e) }}>{inputsData[e]}</button></div>
                                )}
                            </div>
                        </div >
                    )
                } else {
                    // Custom
                    const settings = featureSettings?.[vcp] ?? {}
                    let icon
                    if (settings?.iconType === "windows" && settings?.icon) {
                        icon = (<span className="icon vfix" dangerouslySetInnerHTML={{ __html: `&#x${settings.icon};` }}></span>)
                    } else if (settings?.iconType === "text" && settings?.iconText) {
                        icon = (<span className="icon icon-text vfix">{settings.iconText}</span>)
                    } else {
                        // Default
                        icon = (<span className="icon vfix">&#xe897;</span>)
                    }
                    extraHTML.push(
                        <div className="feature-row feature-volume" key={monitor.key + "_" + vcp}>
                            <div className="feature-icon">{icon}</div>
                            <Slider type="custom" monitorID={monitor.id} level={values[vcp]} monitorName={monitor.name} monitortype={monitor.type} onChange={val => { setValues({ [vcp]: val }); setVCP(monitor.id, parseInt(vcp), val * (monitor.features[vcp][1] / 100)) }} scrollAmount={props.scrollAmount} />
                        </div>
                    )
                }
            }

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
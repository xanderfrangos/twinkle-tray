import React, { useState } from "react"

export default function MonitorFeatures(props) {
    const { monitor, name, monitorFeatures, T } = props

    let extraHTML = []

    if(monitor.type === "ddcci" && monitor?.features && Object.keys(monitor.features).length > 0) {

        // Contrast
        if (monitor.features["0x12"]) {
            const enabled = monitorFeatures?.["0x12"];
            extraHTML.push(
                <div className="feature-toggle-row" key="contrast">
                    <input onChange={() => {props?.toggleFeature(monitor.hwid[1], "0x12")}} checked={(enabled ? true : false)} data-checked={(enabled ? true : false)} type="checkbox" />
                    <div className="feature-toggle-label"><span className="icon vfix">&#xE793;</span><span>{T.t("PANEL_LABEL_CONTRAST")}</span></div>
                </div>
            )
        }
    
        // Volume
        if (monitor.features["0x62"]) {
            const enabled = monitorFeatures?.["0x62"];
            extraHTML.push(
                <div className="feature-toggle-row" key="volume">
                    <input onChange={() => {props?.toggleFeature(monitor.hwid[1], "0x62")}} checked={(enabled ? true : false)} data-checked={(enabled ? true : false)} type="checkbox" />
                    <div className="feature-toggle-label"><span className="icon vfix">&#xE767;</span><span>{T.t("PANEL_LABEL_VOLUME")}</span></div>
                </div>
            )
        }
    
        // Power State
        if (monitor.features["0xD6"]) {
            const enabled = monitorFeatures?.["0xD6"];
            extraHTML.push(
                <div className="feature-toggle-row" key="powerState">
                    <input onChange={() => {props?.toggleFeature(monitor.hwid[1], "0xD6")}} checked={(enabled ? true : false)} data-checked={(enabled ? true : false)} type="checkbox" />
                    <div className="feature-toggle-label"><span className="icon vfix">&#xE7E8;</span><span>{T.t("PANEL_LABEL_OFF_ON")} ⚠️</span></div>
                </div>
            )
        }

    } else {
        extraHTML.push(<p key="none">{T.t("SETTINGS_FEATURES_UNSUPPORTED")}</p>)
    }

    return (
        <div key={monitor.key}>
            <br />
            <div className="sectionSubtitle"><div className="icon">&#xE7F4;</div><div>{monitor.name}</div></div>
            <div className="feature-toggle-list">{extraHTML}</div>
            <br />
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
    } else if (type == "wmi") {
        return (<><b>WMI</b> <span className="icon green vfix">&#xE73D;</span></>)
    } else {
        return (<><b>Unknown ({type})</b> <span className="icon red vfix">&#xEB90;</span></>)
    }
}
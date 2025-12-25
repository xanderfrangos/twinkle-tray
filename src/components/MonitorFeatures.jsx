import React, { useState, useEffect } from "react"
import { useObject } from "../hooks/useObject"
import { SettingsOption, SettingsChild } from "./SettingsOption";
import Slider from "./Slider"
import VCP from "../vcp-codes"
const ignoreCodes = ["0x10", "0x12", "0x13", "0x62", "0xD6", "0x60"]

const deleteIcon = (<span className="icon" dangerouslySetInnerHTML={{ __html: "&#xE74D;" }}></span>)

export default function MonitorFeatures(props) {
    const { monitor, name, monitorFeatures, T, onChange } = props

    let extraHTML = []

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

    if (monitor.ddcciSupported && Object.keys(monitor.features || {}).length > 0) {

        // Brightness (with VCP Code Selection in expanded section)
        if (monitor.features["0x10"]) {
            const currentBrightnessVCP = window.settings?.userDDCBrightnessVCPs?.[monitor?.hwid?.[1]] || ""
            
            extraHTML.push(
                <SettingsOption className="monitor-feature-item" key="brightness" icon="e706" title={T.t("PANEL_LABEL_BRIGHTNESS")} expandable={true}>
                    <SettingsChild>
                        <BrightnessFeatureSettings hwid={monitor?.hwid?.[1]} currentBrightnessVCP={currentBrightnessVCP} T={T} />
                    </SettingsChild>
                </SettingsOption>
            )
        }

        // Contrast
        if (monitor.features["0x12"]) {
            const vcp = "0x12"
            const settings = window.settings?.monitorFeaturesSettings?.[monitor?.hwid[1]]?.[vcp]
            const enabled = monitorFeatures?.["0x12"];
            extraHTML.push(
                <SettingsOption className="monitor-feature-item" key={vcp} icon="E793" title={T.t("PANEL_LABEL_CONTRAST")} expandable={true} input={
                    <div className="inputToggle-generic"><input onChange={() => { props?.toggleFeature(monitor.hwid[1], vcp) }} checked={(enabled ? true : false)} data-checked={(enabled ? true : false)} type="checkbox" /></div>
                }>
                    <SettingsChild>
                        <MonitorFeaturesSettings onChange={onChange} key={vcp + "_settings"} enabled={enabled} settings={settings} hwid={monitor?.hwid?.[1]} T={T} vcp={vcp} />
                    </SettingsChild>
                </SettingsOption>
            )
        }

        // Volume
        if (monitor.features["0x62"]) {
            const vcp = "0x62"
            const settings = window.settings?.monitorFeaturesSettings?.[monitor?.hwid[1]]?.[vcp]
            const enabled = monitorFeatures?.["0x62"];
            extraHTML.push(
                <SettingsOption className="monitor-feature-item" key={vcp} icon="E767" title={T.t("PANEL_LABEL_VOLUME")} expandable={true} input={
                    <div className="inputToggle-generic"><input onChange={() => { props?.toggleFeature(monitor.hwid[1], vcp) }} checked={(enabled ? true : false)} data-checked={(enabled ? true : false)} type="checkbox" /></div>
                }>
                    <SettingsChild>
                        <MonitorFeaturesSettings onChange={onChange} key={vcp + "_settings"} enabled={enabled} settings={settings} hwid={monitor?.hwid?.[1]} T={T} vcp={vcp} />
                    </SettingsChild>
                </SettingsOption>
            )
        }

        // Input
        if (monitor.features["0x60"] && Array.isArray(monitor.features["0x60"]) && monitor.features["0x60"][1]) {
            const vcp = "0x60"
            const settings = window.settings?.monitorFeaturesSettings?.[monitor?.hwid[1]]?.[vcp]
            const enabled = monitorFeatures?.["0x60"];
            extraHTML.push(
                <SettingsOption className="monitor-feature-item" key={vcp} icon="e839" title={`${T.t("PANEL_LABEL_INPUTS")} ⚠️`} expandable={true} input={
                    <div className="inputToggle-generic"><input onChange={() => { props?.toggleFeature(monitor.hwid[1], vcp) }} checked={(enabled ? true : false)} data-checked={(enabled ? true : false)} type="checkbox" /></div>
                }>
                    <SettingsChild description={
                        <>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                                {(Array.isArray(monitor.features["0x60"][1]) ? monitor.features["0x60"][1] : [])?.map(e =>
                                    <div key={e + monitor.id} className="button" style={{ color: monitor.features[vcp] === e ? "red" : '' }} disabled={monitor.features[vcp] === e}>{inputsData[e]}</div>
                                )}
                            </div>
                            <div style={{ marginTop: "10px" }}>
                                ⚠️ {T.t("GENERIC_DDC_WARNING")}
                            </div>
                        </>
                    }>
                    </SettingsChild>
                </SettingsOption>
            )
        }

        // Power State
        if (monitor.features["0xD6"]) {
            const vcp = "0xD6"
            const enabled = monitorFeatures?.["0xD6"];
            extraHTML.push(
                <SettingsOption className="monitor-feature-item" key={vcp} icon="E7E8" title={`${T.t("PANEL_LABEL_OFF_ON")} ⚠️`} expandable={true} input={
                    <div className="inputToggle-generic"><input onChange={() => { props?.toggleFeature(monitor.hwid[1], vcp) }} checked={(enabled ? true : false)} data-checked={(enabled ? true : false)} type="checkbox" /></div>
                }>
                    <SettingsChild description={`⚠️ ${T.t("GENERIC_DDC_WARNING")}`} />
                </SettingsOption>
            )
        }

        const deleteFeature = vcp => {
            if (monitorFeatures[vcp] != undefined) {
                delete window.settings?.monitorFeatures[monitor.hwid[1]][vcp]
            }
            if (window.settings?.monitorFeaturesSettings?.[monitor?.hwid[1]]?.[vcp] !== undefined) {
                delete window.settings?.monitorFeaturesSettings?.[monitor?.hwid[1]]?.[vcp]
            }
            window.sendSettings({ monitorFeatures: window.settings?.monitorFeatures, monitorFeaturesSettings: window.settings?.monitorFeaturesSettings })
        }

        // Custom Features
        for (const vcp in monitorFeatures) {
            if (ignoreCodes.indexOf(vcp) === -1 && monitorFeatures[vcp] !== undefined) {
                const settings = window.settings?.monitorFeaturesSettings?.[monitor?.hwid[1]]?.[vcp]
                const enabled = monitorFeatures?.[vcp];
                const name = (settings?.iconType === "text" && settings?.iconText?.length ? settings.iconText : "Custom Feature")
                const icon = (settings?.iconType === "windows" && settings?.icon ? settings.icon : "E9E9")
                extraHTML.push(
                    <SettingsOption className="monitor-feature-item" key={vcp} icon={icon} title={`${name} (${vcp})`} expandable={true} input={
                        <div className="input-row"><div style={{ cursor: "pointer" }} onClick={() => deleteFeature(vcp)}>{deleteIcon}</div><div className="inputToggle-generic"><input onChange={() => { props?.toggleFeature(monitor.hwid[1], vcp) }} checked={(enabled ? true : false)} data-checked={(enabled ? true : false)} type="checkbox" /></div></div>
                    }>
                        <SettingsChild>
                            <MonitorFeaturesSettings onChange={onChange} key={vcp + "_settings"} enabled={enabled} settings={settings} hwid={monitor?.hwid?.[1]} T={T} vcp={vcp} />
                        </SettingsChild>
                    </SettingsOption>
                )
            }
        }

        // VCP code list
        if (monitor.vcpCodes && typeof monitor.vcpCodes === 'object' && Object.values(monitor.vcpCodes).length) {
            const list = []
            for (const code in monitor.vcpCodes) {
                list.push(
                    <div className="vcp-code" key={code}><b>{code}</b>: {findVCPCodeName(code) || "???"}
                        {
                            monitor.vcpCodes[code].length
                                ? <div className="supported-values">{T.t("SETTINGS_FEATURES_VCP_EXPECTED")}: {monitor.vcpCodes[code].toString()}</div>
                                : ""
                        }
                    </div>
                )
            }
            if (list) {
                extraHTML.push(
                    <SettingsOption className="monitor-feature-item" key={"vcp-codes"} description={T.t("SETTINGS_FEATURES_VCP_LIST_TITLE")} expandable={true} forceExpandable={true}>
                        <SettingsChild>
                            <div className="detected-vcp-codes">
                                <div className="vcp-code">⚠️ {T.t("SETTINGS_FEATURES_VCP_LIST_DESC")}<br /><br /></div>
                                {list}
                            </div>
                        </SettingsChild>
                    </SettingsOption>
                )
            }
        }

        extraHTML.push(
            <div className="input-row" key="add">
                <p><a onClick={() => { props.onAddFeature() }} className="button">+ {T.t("SETTINGS_FEATURES_ADD")}</a></p>
            </div>
        )

    } else {
        extraHTML.push(<p key="none">{T.t("SETTINGS_FEATURES_UNSUPPORTED")}</p>)
    }

    return (
        <div key={monitor.key}>
            <br />
            <div className="sectionSubtitle"><div className="icon">&#xE7F4;</div><div>{monitor.name}</div></div>
            {extraHTML}
        </div>
    )
}

function MonitorFeaturesSettings(props) {
    const { enabled, settings, hwid, vcp, onChange, T } = props
    //if(!enabled) return (<></>);

    const [settingsObj, updateSettings] = useObject(Object.assign({
        icon: "e897",
        iconType: "windows",
        iconText: "",
        iconPath: "",
        min: 0,
        max: 100,
        maxVisual: 100,
        linked: false
    }, settings))

    const onChangeHandler = (settingName, value) => {
        try {
            updateSettings({ [settingName]: value })
            if (!window.settings.monitorFeaturesSettings[hwid]) {
                window.settings.monitorFeaturesSettings[hwid] = {}
            }
            if (!window.settings.monitorFeaturesSettings[hwid][vcp]) {
                window.settings.monitorFeaturesSettings[hwid][vcp] = {}
            }
            window.settings.monitorFeaturesSettings[hwid][vcp][settingName] = value
            if (onChange) onChange(settingName, value);
        } catch (e) {
            console.log(e)
        }
    }

    const iconType = (
        <div className="field">
            <label>{T.t("GENERIC_SLIDER_INDICATOR_TYPE")}</label>
            <select value={settingsObj.iconType} onChange={e => onChangeHandler("iconType", e.target.value)} style={{ flex: "0.65" }}>
                <option value="windows">{T.t("GENERIC_ICON")}</option>
                <option value="text">{T.t("GENERIC_TEXT")}</option>
            </select>
        </div>
    )

    const icon = (
        <div className="field">
            <label>{T.t("GENERIC_SLIDER_ICON")}</label>
            <select style={{ fontFamily: `"Segoe Fluent Icons", "Segoe MDL2 Assets"` }} value={settingsObj.icon} onChange={e => onChangeHandler("icon", e.target.value)}>
                <WindowsIconsOptions />
            </select>
        </div>
    )

    const iconText = (
        <div className="field">
            <label>{T.t("GENERIC_SLIDER_TEXT")}</label>
            <input type="text" value={settingsObj.iconText} onChange={e => onChangeHandler("iconText", e.target.value)} placeholder={T.t("GENERIC_SLIDER_NAME")} />
        </div>
    )

    const iconSettings = (
        <div className="input-row">
            {iconType}
            {settingsObj.iconType === "windows" ? icon : null}
            {settingsObj.iconType === "text" ? iconText : null}
        </div>
    )

    return (
        <div className="feature-toggle-settings">
            {ignoreCodes.indexOf(vcp) === -1 ? iconSettings : null}
            <div className="input-row">
                <Slider min={0} max={100} name={T.t("GENERIC_MINIMUM")} onChange={value => onChangeHandler("min", value)} level={settingsObj.min} scrolling={false} height={"short"} icon={false} />
                <Slider min={0} max={100} name={T.t("GENERIC_MAXIMUM")} onChange={value => onChangeHandler("max", value)} level={settingsObj.max} scrolling={false} height={"short"} icon={false} />
            </div>
            <div className="input-row">
                <div className="feature-toggle-row">
                    <input onChange={e => onChangeHandler("linked", e.target.checked)} checked={(settingsObj.linked ? true : false)} data-checked={(settingsObj.linked ? true : false)} type="checkbox" />
                    <div className="feature-toggle-label"><span>{T.t("SETTINGS_FEATURES_LINKED_TO_BRIGHTNESS")}</span></div>
                </div>
            </div>
            <div style={{ display: (settingsObj.linked ? "block" : "none") }}>
                <br />
                <Slider min={0} max={100} name={T.t("SETTINGS_FEATURES_STOP_ON_BRIGHTNESS")} onChange={value => onChangeHandler("maxVisual", value)} level={settingsObj.maxVisual ?? 100} scrolling={false} height={"short"} icon={false} />
            </div>
        </div>
    )
}

/**
 * Component for setting a custom VCP code for brightness control.
 * 
 * This component allows the user to specify a custom VCP (Virtual Control Panel) code
 * for controlling monitor brightness. The expected format for VCP codes is a hexadecimal
 * string (e.g., "0x10", "0x6B"). The setting is persisted in the application's settings
 * under `userDDCBrightnessVCPs` and applied immediately via `window.sendSettings`.
 * 
 * @param {Object} props - Component props
 * @param {string} props.hwid - Hardware ID of the monitor
 * @param {string} props.currentBrightnessVCP - Current custom VCP code (hex string like "0x10")
 * @param {Object} props.T - Translation object
 */
function BrightnessFeatureSettings(props) {
    const { hwid, currentBrightnessVCP, T } = props

    const [vcpInput, setVcpInput] = useState(currentBrightnessVCP)

    // Sync input value when settings change externally
    useEffect(() => {
        setVcpInput(currentBrightnessVCP)
    }, [currentBrightnessVCP])

    const handleVCPChange = (e) => {
        const value = e.target.value.trim()
        setVcpInput(value)
        
        const newUserVCPs = Object.assign({}, window.settings?.userDDCBrightnessVCPs || {})
        if (value === "") {
            delete newUserVCPs[hwid]
        } else {
            // Validate the input is a valid hex VCP code (0x00-0xFF)
            const parsed = parseInt(value, 16)
            if (isNaN(parsed) || parsed < 0 || parsed > 0xFF) {
                // Invalid input - don't save, just update the input field
                return
            }
            newUserVCPs[hwid] = value
        }
        window.sendSettings({ userDDCBrightnessVCPs: newUserVCPs })
    }

    return (
        <div className="feature-toggle-settings">
            <p className="description" style={{ marginBottom: "12px", opacity: 0.8, fontSize: "12px" }}>
                {T.t("SETTINGS_FEATURES_BRIGHTNESS_VCP_INFO") || "If your monitor uses a non-standard VCP code for brightness (such as 0x13 or 0x6B), or if you would like to remap the brightness slider to a different VCP code, you can enter that code below."}
            </p>
            <div className="input-row">
                <div className="field" style={{ flex: 1 }}>
                    <label>{T.t("SETTINGS_FEATURES_BRIGHTNESS_VCP_TITLE") || "VCP Code"}</label>
                    <input type="text" value={vcpInput} onChange={handleVCPChange} placeholder="0x10" style={{ maxWidth: "120px" }} />
                </div>
            </div>
            <p className="description" style={{ marginTop: "8px", opacity: 0.7, fontSize: "12px" }}>
                {T.t("SETTINGS_FEATURES_BRIGHTNESS_VCP_DESC") || "Leave empty for default (0x10). Find supported codes in the list below."}
            </p>
        </div>
    )
}

const windowsIcons = [
    "e897",
    "e706",
    "e70c",
    "e71d",
    "e727",
    "e733",
    "e734",
    "e73a",
    "e772",
    "e767",
    "e760",
    "e761",
    "e781",
    "e783",
    "e793",
    "e794",
    "e7a1",
    "e7b3",
    "e7e8",
    "e7f4",
    "e7f7",
    "e82f",
    "e836",
    "ea61",
    "ea80",
    "eb67",
    "ebaa",
    "edb1",
    "edb5",
    "f08c",
    "f093",
    "f094",
    "f095",
    "f096",
    "f0ce",
    "f1db",
    "f1e8",
    "f4a5",
    "f736",
    "f78b",
    "f785",
    "f78d",
    "f0b2",
    "e8be",
    "e88e",
    "e839",
    "e7fc",
    "e78b",
    "e713",
    "eb9f",
    "ed39",
    "ed3a"
]

function WindowsIconsOptions(props) {
    return windowsIcons.map(icon => {
        return (<option style={{ fontFamily: `"Segoe Fluent Icons", "Segoe MDL2 Assets"`, fontSize: "18px" }} key={icon} value={icon} dangerouslySetInnerHTML={{ __html: `&#x${icon};` }}></option>)
    })
}

function findVCPCodeName(code) {
    for (const name in VCP) {
        if (VCP[name] == code) {
            return name
        }
    }
    return false
}

import React, { useState } from "react"
import { useObject } from "../hooks/useObject"
import { SettingsOption, SettingsChild } from "./SettingsOption";
import Slider from "./Slider"
import VCP from "../vcp-codes"
const ignoreCodes = ["0x10", "0x12", "0x13", "0x62", "0xD6"]

const deleteIcon = (<span className="icon" dangerouslySetInnerHTML={{ __html: "&#xE74D;" }}></span>)

export default function MonitorFeatures(props) {
    const { monitor, name, monitorFeatures, T, onChange } = props

    let extraHTML = []

    if(monitor.ddcciSupported && Object.keys(monitor.features).length > 0) {

        // Contrast
        if (monitor.features["0x12"]) {
            const vcp = "0x12"
            const settings = window.settings?.monitorFeaturesSettings?.[monitor?.hwid[1]]?.[vcp]
            const enabled = monitorFeatures?.["0x12"];
            extraHTML.push(
                <SettingsOption className="monitor-feature-item" key={vcp} icon="E793" title={T.t("PANEL_LABEL_CONTRAST")} expandable={true} input={
                    <div className="inputToggle-generic"><input onChange={() => {props?.toggleFeature(monitor.hwid[1], vcp)}} checked={(enabled ? true : false)} data-checked={(enabled ? true : false)} type="checkbox" /></div>
                }>
                    <SettingsChild>
                        <MonitorFeaturesSettings onChange={onChange} key={vcp + "_settings"} enabled={enabled} settings={settings} hwid={monitor?.hwid?.[1]} vcp={vcp} /> 
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
                <SettingsOption className="monitor-feature-item" key={vcp} icon="E767" title={T.t("PANEL_LABEL_VOLUME")} expandable={true}  input={
                    <div className="inputToggle-generic"><input onChange={() => {props?.toggleFeature(monitor.hwid[1], vcp)}} checked={(enabled ? true : false)} data-checked={(enabled ? true : false)} type="checkbox" /></div>
                }>
                    <SettingsChild>
                        <MonitorFeaturesSettings onChange={onChange} key={vcp + "_settings"} enabled={enabled} settings={settings} hwid={monitor?.hwid?.[1]} vcp={vcp} /> 
                    </SettingsChild>
                </SettingsOption>
            )
        }
    
        // Power State
        if (monitor.features["0xD6"]) {
            const vcp = "0xD6"
            const enabled = monitorFeatures?.["0xD6"];
            extraHTML.push(
                <SettingsOption className="monitor-feature-item" key={vcp} icon="E7E8" title={`${T.t("PANEL_LABEL_OFF_ON")} ⚠️`} expandable={true}  input={
                    <div className="inputToggle-generic"><input onChange={() => {props?.toggleFeature(monitor.hwid[1], vcp)}} checked={(enabled ? true : false)} data-checked={(enabled ? true : false)} type="checkbox" /></div>
                }>
                    <SettingsChild description={`⚠️ ${T.t("GENERIC_DDC_WARNING")}`} />
                </SettingsOption>
            )
        }

        const deleteFeature = vcp => {
            if(monitorFeatures[vcp] != undefined) {
                delete window.settings?.monitorFeatures[monitor.hwid[1]][vcp]
            }
            if(window.settings?.monitorFeaturesSettings?.[monitor?.hwid[1]]?.[vcp] !== undefined) {
                delete window.settings?.monitorFeaturesSettings?.[monitor?.hwid[1]]?.[vcp]
            }
            window.sendSettings({ monitorFeatures: window.settings?.monitorFeatures, monitorFeaturesSettings: window.settings?.monitorFeaturesSettings })
        }

        // Custom Features
        for(const vcp in monitorFeatures) {
            if(ignoreCodes.indexOf(vcp) === -1 && monitorFeatures[vcp] !== undefined) {
                const settings = window.settings?.monitorFeaturesSettings?.[monitor?.hwid[1]]?.[vcp]
                const enabled = monitorFeatures?.[vcp];
                const name = (settings?.iconType === "text" && settings?.iconText?.length ? settings.iconText : "Custom Feature")
                const icon = (settings?.iconType === "windows" && settings?.icon ? settings.icon : "E9E9")
				const fixedValues = monitor?.vcpCodes ? monitor.vcpCodes[vcp] : [];
                extraHTML.push(
                    <SettingsOption className="monitor-feature-item" key={vcp} icon={icon} title={`${name} (${vcp})`} expandable={true}  input={
                        <div className="input-row"><div style={{cursor: "pointer"}} onClick={() => deleteFeature(vcp)}>{deleteIcon}</div><div className="inputToggle-generic"><input onChange={() => {props?.toggleFeature(monitor.hwid[1], vcp)}} checked={(enabled ? true : false)} data-checked={(enabled ? true : false)} type="checkbox" /></div></div>
                    }>
                        <SettingsChild>
                            <MonitorFeaturesSettings onChange={onChange} key={vcp + "_settings"} enabled={enabled} settings={settings} hwid={monitor?.hwid?.[1]} vcp={vcp} fixedValues={fixedValues} /> 
                        </SettingsChild>
                    </SettingsOption>
                )
            }
        }

        // VCP code list
        if(monitor.vcpCodes && typeof monitor.vcpCodes === 'object' && Object.values(monitor.vcpCodes).length) {
            const list = []
            for(const code in monitor.vcpCodes) {
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
            if(list) {
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
                <p><a onClick={() => {props.onAddFeature()}} className="button">+ {T.t("SETTINGS_FEATURES_ADD")}</a></p>
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
    const { enabled, settings, hwid, vcp, fixedValues, onChange } = props 
    //if(!enabled) return (<></>);

    const [settingsObj, updateSettings] = useObject(Object.assign({
        icon: "e897",
        iconType: "windows",
        iconText: "",
        iconPath: "",
        min: 0,
        max: 100,
        maxVisual: 100,
        linked: false,
		fixedValues: fixedValues
      }, settings))

      const onChangeHandler = (settingName, value) => {
        try {
            updateSettings({[settingName]: value})
            if(!window.settings.monitorFeaturesSettings[hwid]) {
                window.settings.monitorFeaturesSettings[hwid] = {}
            }
            if(!window.settings.monitorFeaturesSettings[hwid][vcp]) {
                window.settings.monitorFeaturesSettings[hwid][vcp] = {}
            }
            window.settings.monitorFeaturesSettings[hwid][vcp][settingName] = value
            if(onChange) onChange(settingName, value);
        } catch(e) {
            console.log(e)
        }
      }

	  const labelPrefix = (fixedValues && fixedValues.length > 0) ? "" : "Slider";

      const iconType = (
        <div className="field">
            <label>{labelPrefix} Indicator Type</label>
            <select value={settingsObj.iconType} onChange={e => onChangeHandler("iconType", e.target.value)} style={{flex: "0.65"}}>
                <option value="windows">Icon</option>
                <option value="text">Text</option>
            </select>
        </div>
      )

      const icon = (
        <div className="field">
            <label>{labelPrefix} Icon</label>
            <select style={{fontFamily: `"Segoe Fluent Icons", "Segoe MDL2 Assets"`}} value={settingsObj.icon} onChange={e => onChangeHandler("icon", e.target.value)}>
                <WindowsIconsOptions />
            </select>
        </div>
      )

      const iconText = (
        <div className="field">
            <label>{labelPrefix} Text</label>
            <input type="text" value={settingsObj.iconText} onChange={e => onChangeHandler("iconText", e.target.value)} placeholder={"Enter name for slider"} />
        </div>
      )

      const iconSettings = (
        <div className="input-row">
            { iconType }
            { settingsObj.iconType === "windows" ? icon : null }
            { settingsObj.iconType === "text" ? iconText : null }
        </div>
      )

	if (fixedValues && fixedValues.length > 0)
	{
		return(
			<div className="feature-toggle-settings">
				{ ignoreCodes.indexOf(vcp) === -1 ? iconSettings : null }
			</div>
		)
	}
	else
	{
		return(
			<div className="feature-toggle-settings">
				{ ignoreCodes.indexOf(vcp) === -1 ? iconSettings : null }
				<div className="input-row">
					<Slider min={0} max={100} name={"Min"} onChange={value => onChangeHandler("min", value)} level={settingsObj.min} scrolling={false} height={"short"} icon={false} />
					<Slider min={0} max={100} name={"Max"} onChange={value => onChangeHandler("max", value)} level={settingsObj.max} scrolling={false} height={"short"} icon={false} />
				</div>
				<div className="input-row">
					<div className="feature-toggle-row">
						<input onChange={e => onChangeHandler("linked", e.target.checked)} checked={(settingsObj.linked ? true : false)} data-checked={(settingsObj.linked ? true : false)} type="checkbox" />
						<div className="feature-toggle-label"><span>Linked to brightness</span></div>
					</div>
				</div>
				<div style={{display: (settingsObj.linked ? "block" : "none")}}>
					<br />
					<Slider min={0} max={100} name={"Stop after this brightness level"} onChange={value => onChangeHandler("maxVisual", value)} level={settingsObj.maxVisual ?? 100} scrolling={false} height={"short"} icon={false} />
				</div>
			</div>
		)
	}
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
        return (<option style={{fontFamily: `"Segoe Fluent Icons", "Segoe MDL2 Assets"`, fontSize: "18px"}} key={icon} value={icon} dangerouslySetInnerHTML={{__html: `&#x${icon};` }}></option>)
    })
}

function findVCPCodeName(code) {
    for(const name in VCP) {
        if(VCP[name] == code) {
            return name
        }
    }
    return false
}
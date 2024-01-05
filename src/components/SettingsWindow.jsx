/*

Hi,
If you're reading this, you probably want to know how this component works.
This component is not good. Mistakes were made.
It's a horrible bowl of spaghetti.
Run while you still can.

*/

import React, { PureComponent } from "react";
import Titlebar from './Titlebar'
import Slider from "./Slider";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import Markdown from 'markdown-to-jsx';
import TranslateReact from "../TranslateReact"
import MonitorInfo from "./MonitorInfo"
import MonitorFeatures from "./MonitorFeatures"
import { SettingsOption, SettingsChild } from "./SettingsOption";
import SafeRender from "./SafeRender";

import DefaultIcon from "../assets/tray-icons/dark/icon@4x.png"
import MDL2Icon from "../assets/tray-icons/dark/mdl2@4x.png"
import FluentIcon from "../assets/tray-icons/dark/fluent@4x.png"

const uuid = () => crypto.randomUUID()

const reorder = (list, startIndex, endIndex) => {
    const result = Array.from(list);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    return result;
};

const getItemStyle = (isDragging, draggableStyle) => ({
    userSelect: "none",
    background: isDragging ? "rgba(122, 122, 122, 0.2)" : "none",
    ...draggableStyle
});

const monitorSort = (a, b) => {
    const aSort = (a.order === undefined ? 999 : a.order * 1)
    const bSort = (b.order === undefined ? 999 : b.order * 1)
    return aSort - bSort
}

const deleteIcon = (<span className="icon" dangerouslySetInnerHTML={{ __html: "&#xE74D;" }}></span>)

const cleanUpKeyboardKeys = (inKey, inCode = false) => {
    let key = inKey
    let code = inCode

    if (key.length == 1) {
        key = key.toUpperCase()
    }

    switch (key) {
        case "Meta":
            key = "Super";
            break;
        case " ":
            key = "Space";
            break;
        case "ArrowUp":
            key = "Up";
            break;
        case "ArrowDown":
            key = "Down";
            break;
        case "ArrowLeft":
            key = "Left";
            break;
        case "ArrowRight":
            key = "Right";
            break;
        case "+":
            key = "Plus";
            break;
        case "-":
            key = "Minus";
            break;
    }

    if (code >= 96 && code <= 105) key = "num" + (code - 96);

    switch (code) {
        case 106: key = "nummult"; break;
        case 107: key = "numadd"; break;
        case 109: key = "numsub"; break;
        case 110: key = "numdec"; break;
        case 111: key = "numdiv"; break;
    }

    return key;
}

const defaultAction = {
    type: "set",
    target: "brightness",
    monitors: {},
    allMonitors: false,
    value: 0,
    values: [0],
    id: uuid()
}

let T = new TranslateReact({}, {})

export default class SettingsWindow extends PureComponent {

    constructor(props) {
        super(props)
        this.state = {
            rawSettings: {},
            activePage: "general",
            theme: 'default',
            openAtLogin: false,
            brightnessAtStartup: true,
            monitors: [],
            remaps: [],
            names: [],
            hotkeys: [],
            adjustmentTimes: [],
            linkedLevelsActive: false,
            updateInterval: (window.settings.updateInterval || 500),
            downloadingUpdate: false,
            checkForUpdates: false,
            adjustmentTimeIndividualDisplays: false,
            languages: [],
            analytics: false,
            useAcrylic: true,
            scrollShortcut: true,
            updateProgress: 0,
            extendedDDCCI: {
                contrast: 50,
                volume: 50,
                powerState: 0
            },
            windowHistory: [],
            showAddFeatureOverlay: false,
            addFeatureMonitor: "",
            addFeatureValue: "",
            addFeatureError: false
        }
        this.numMonitors = 0
        this.downKeys = {}
        this.lastLevels = []
        this.onDragEnd = this.onDragEnd.bind(this);
        this.sendSettingsTimeout = false
        this.sendSettingsValues = {}
        this.settingsPageRef = React.createRef()
        this.addFeatureInputRef = React.createRef()
        this.addFeatureOKRef = React.createRef()
        this.addFeatureCancelRef = React.createRef()
    }

    sendSettingsThrottle = (newSetting = {}) => {
        this.sendSettingsValues = Object.assign(this.sendSettingsValues, newSetting)
        if (this.sendSettingsTimeout) {
            clearTimeout(this.sendSettingsTimeout)
        }
        this.sendSettingsTimeout = setTimeout(() => {
            window.sendSettings(Object.assign({}, this.sendSettingsValues))
            this.sendSettingsValues = {}
        }, 2000)
    }

    componentDidMount() {
        window.addEventListener("monitorsUpdated", this.recievedMonitors)
        window.addEventListener("settingsUpdated", this.recievedSettings)
        window.addEventListener("localizationUpdated", (e) => { this.setState({ languages: e.detail.languages });  T.setLocalizationData(e.detail.desired, e.detail.default)}); 
        window.addEventListener("windowHistory", e => this.setState({ windowHistory: e.detail }))

        if (window.isAppX === false) {
            window.addEventListener("updateUpdated", (e) => {
                const version = e.detail
                this.setState({
                    releaseURL: (window.isAppX ? "ms-windows-store://pdp/?productid=9PLJWWSV01LK" : version.releaseURL),
                    latest: version.version,
                    downloadURL: version.downloadURL,
                    changelog: version.changelog,
                    error: (version.error != undefined ? version.error : false)
                })
                if (e.detail.error == true) {
                    this.setState({
                        downloadingUpdate: false
                    })
                }
            })
            window.addEventListener("updateProgress", (e) => {
                this.setState({
                    updateProgress: e.detail.progress
                })
            })
            window.checkForUpdates()
        }
        window.ipc.send('get-window-history')
        window.ipc.send("sendSettingsWindowPos")
        window.ipc.send('request-localization')
        window.reactReady = true
    }



    onDragEnd(result) {
        // dropped outside the list
        if (!result.destination) {
            return;
        }
        const sorted = Object.values(this.state.monitors).slice(0).sort(monitorSort)
        const items = reorder(
            sorted,
            result.source.index,
            result.destination.index
        );

        let order = []
        let idx = 0
        for (let monitor of items) {
            this.state.monitors[monitor.key].order = idx
            order.push({
                id: monitor.id,
                order: idx
            })
            idx++
        }

        this.setState({
            order
        });

        window.sendSettings({ order })
    }



    getRemap = (name) => {
        if (this.state.remaps[name] === undefined) {
            return {
                isFallback: true,
                min: 0,
                max: 100
            }
        }
        return this.state.remaps[name]
    }


    minMaxChanged = (value, slider) => {

        const name = slider.props.monitorID
        let remaps = Object.assign({}, this.state.remaps)

        if (remaps[name] === undefined) {
            remaps[name] = {
                min: 0,
                max: 100
            }
        }

        if (slider.props.type == "min") {
            remaps[name].min = value

            // Keep within 10%, cap

            if (remaps[name].min > remaps[name].max - 10) {
                remaps[name].max = remaps[name].min + 10
            }

            if (remaps[name].max > 100) {
                remaps[name].max = 100
            }

            if (remaps[name].min > remaps[name].max - 10) {
                remaps[name].min = remaps[name].max - 10
            }

        } else if (slider.props.type == "max") {
            remaps[name].max = value

            // Keep within 10%, cap

            if (remaps[name].min > remaps[name].max - 10) {
                remaps[name].min = remaps[name].max - 10
            }

            if (remaps[name].min < 0) {
                remaps[name].min = 0
            }

            if (remaps[name].min > remaps[name].max - 10) {
                remaps[name].max = remaps[name].min + 10
            }
        }

        const oldData = JSON.stringify(this.state.remaps);
        const newData = JSON.stringify(remaps);
        const hasChanged = (oldData == newData ? false : true);
        //if(!hasChanged) return false;
        this.setState({ remaps })
        window.sendSettings({ remaps })
    }

    themeChanged = (event) => {
        this.setState({ theme: event.target.value })
        window.sendSettings({ theme: event.target.value })
    }

    updateIntervalChanged = (event) => {
        this.setState({ updateInterval: event.target.value * 1 })
        window.sendSettings({ updateInterval: event.target.value * 1 })
    }

    sleepActionChanged = (event) => {
        window.sendSettings({ sleepAction: event.target.value })
    }

    monitorNameChange = (e, f) => {
        const idx = e.currentTarget.dataset.key
        this.state.names[window.allMonitors[idx].id] = e.currentTarget.value
        this.forceUpdate()
        window.sendSettings({ names: this.state.names })
    }

    getMonitorName = (monitor, renames) => {
        if (Object.keys(renames).indexOf(monitor.id) >= 0 && renames[monitor.id] != "") {
            return renames[monitor.id] + ` (${monitor.name})`
        } else {
            return monitor.name
        }
    }

    getSidebar = () => {
        const items = [
            {
                id: "general",
                label: T.t("SETTINGS_SIDEBAR_GENERAL"),
                icon: "&#xE713;"
            },
            {
                id: "monitors",
                label: T.t("SETTINGS_SIDEBAR_MONITORS"),
                icon: "&#xE7F4;"
            },
            {
                id: "features",
                label: T.t("SETTINGS_SIDEBAR_FEATURES"),
                icon: "&#xE9E9;"
            },
            {
                id: "time",
                label: T.t("SETTINGS_SIDEBAR_TIME"),
                icon: "&#xE823;"
            },
            {
                id: "hotkeys",
                label: T.t("SETTINGS_SIDEBAR_HOTKEYS"),
                icon: "&#xF210;"
            },
            {
                id: "updates",
                label: T.t("SETTINGS_SIDEBAR_UPDATES"),
                icon: "&#xE895;"
            },
            {
                id: "debug",
                label: "Debug",
                icon: "&#xEBE8;",
                type: "debug"
            }
        ]
        return items.map((item, index) => {
            return (<div key={item.id} className="item" data-active={this.isSection(item.id)} data-type={item.type || "none"} onClick={() => { this.setState({ activePage: item.id }); window.currentSettingsPage = item.id; this.scrollToTop(); window.reloadReactMonitors(); window.requestMonitors(); }}>
                <div className="icon" dangerouslySetInnerHTML={{ __html: (item.icon || "&#xE770;") }}></div><div className="label">{item.label || `Item ${index}`}</div>
            </div>)
        })
    }


    getLanguages = () => {
        if (this.state.languages && this.state.languages.length > 0) {
            return this.state.languages.map((value, index) => {
                return (<option key={value.id} value={value.id}>{value.name}</option>)
            })
        }
    }

    scrollToTop = () => {
        try {
            this.settingsPageRef.current.scrollTop = 0
        } catch(e) { }
    }


    getUpdate = () => {
        if (window.isAppX) {
            return (
                <p><a onClick={() => { window.openURL("ms-store") }}>{T.t("SETTINGS_UPDATES_MS_STORE")}</a></p>
            )
        } else {
            if (this.state.latest && this.state.latest != window.version) {
                return (
                    <div>
                        <p><b style={{ color: window.accent }}>{T.t("SETTINGS_UPDATES_AVAILABLE") + ` (${this.state.latest})`}</b></p>
                        <div className="changelog">
                            <h3>{this.state.latest}</h3>
                            <Markdown options={{ forceBlock: true }}>{this.state.changelog}</Markdown>
                        </div>
                        <br />
                        {this.getUpdateButton()}
                    </div>
                )
            } else if (this.state.latest) {
                return (
                    <div>
                        <p>{T.t("SETTINGS_UPDATES_NONE_AVAILABLE")}</p>
                        <div className="changelog"><Markdown options={{ forceBlock: true }}>{this.state.changelog}</Markdown></div>
                    </div>
                )
            }
        }
    }

    getUpdateButton = () => {
        if (this.state.downloadingUpdate) {
            return (<div><p><b>{T.t("SETTINGS_UPDATES_DOWNLOADING")}</b></p><div className="progress-bar"><div style={{ width: `${this.state.updateProgress}%` }}></div></div></div>)
        } else {
            return (<a className="button" onClick={() => { window.getUpdate(); this.setState({ downloadingUpdate: true }) }}><span className="icon red vfix" style={{ paddingRight: "6px", display: (this.state.error ? "inline" : "none") }}>&#xE783;</span>{T.t("SETTINGS_UPDATES_DOWNLOAD", this.state.latest)}</a>)
        }
    }

    getMinMaxMonitors = () => {
        if (this.state.monitors == undefined || Object.keys(this.state.monitors).length == 0) {
            return (<div className="no-displays-message">{T.t("GENERIC_NO_COMPATIBLE_DISPLAYS")}<br /><br /></div>)
        } else {
            return Object.values(this.state.monitors).map((monitor, index) => {
                if (monitor.type == "none") {
                    return (<div key={monitor.name}></div>)
                } else {
                    // New method, by ID
                    let remap = this.getRemap(monitor.id)
                    // Old method, by name
                    if (remap.isFallback) {
                        remap = this.getRemap(monitor.name)
                    }
                    return (
                        <SettingsOption key={monitor.id} icon="E7F4" title={getMonitorName(monitor, this.state.names)}>
                            <SettingsChild content={
                                <div className="input-row">
                                    <div className="monitor-item">
                                        <label>{T.t("GENERIC_MINIMUM")}</label>
                                        <Slider key={monitor.id + ".min"} type="min" monitorID={monitor.id} level={remap.min} monitorName={monitor.name} monitortype={monitor.type} onChange={this.minMaxChanged} scrolling={false} height={"short"} />
                                    </div>
                                    <div className="monitor-item">
                                        <label>{T.t("GENERIC_MAXIMUM")}</label>
                                        <Slider key={monitor.id + ".max"} type="max" monitorID={monitor.id} level={remap.max} monitorName={monitor.name} monitortype={monitor.type} onChange={this.minMaxChanged} scrolling={false} height={"short"} />
                                    </div>
                                </div>
                            } />
                        </SettingsOption>

                    )
                }
            })
        }
    }

    getRenameMonitors = () => {
        if (this.state.monitors == undefined || Object.keys(this.state.monitors).length == 0) {
            return (<SettingsChild content={<div className="no-displays-message">{T.t("GENERIC_NO_COMPATIBLE_DISPLAYS")}<br /><br /></div>} />)
        } else {
            return Object.values(this.state.monitors).map((monitor, index) => {
                if (monitor.type == "none") {
                    return null
                } else {
                    return (
                        <SettingsChild key={monitor.id} icon="E7F4" title={monitor.name} input={(
                            <input type="text" placeholder={T.t("SETTINGS_MONITORS_ENTER_NAME")} data-key={monitor.key} onChange={this.monitorNameChange} value={(this.state.names[monitor.id] ? this.state.names[monitor.id] : "")}></input>
                        )} />
                    )
                }
            })
        }
    }


    getReorderMonitors = () => {
        if (this.state.monitors == undefined || this.numMonitors == 0) {
            return (<div className="no-displays-message">{T.t("GENERIC_NO_COMPATIBLE_DISPLAYS")}<br /><br /></div>)
        } else {
            const sorted = Object.values(this.state.monitors).slice(0).sort(monitorSort)
            return (
                <DragDropContext onDragEnd={this.onDragEnd}>
                    <Droppable droppableId="droppable">
                        {(provided, snapshot) => (
                            <div
                                {...provided.droppableProps}
                                ref={provided.innerRef}
                            >
                                {sorted.map((monitor, index) => {
                                    if (monitor.type == "none") {
                                        return (<div key={monitor.id}></div>)
                                    } else {
                                        return (
                                            <Draggable key={monitor.id} draggableId={monitor.id} index={index}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        {...provided.dragHandleProps}
                                                        style={getItemStyle(
                                                            snapshot.isDragging,
                                                            provided.draggableProps.style
                                                        )}
                                                    >
                                                        <div className="sectionSubtitle"><div className="icon">&#xE7F4;</div><div>{getMonitorName(monitor, this.state.names)}</div></div>
                                                    </div>
                                                )}
                                            </Draggable>
                                        )
                                    }
                                })}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
            )

        }
    }

    updateAdjustmentTime(time, idx) {
        this.state.adjustmentTimes[idx] = Object.assign({}, time)
        window.sendSettings({ adjustmentTimes: this.state.adjustmentTimes.slice() })
        this.forceUpdate()
    }

    getAdjustmentTimes = () => {
        if (this.state.adjustmentTimes == undefined || this.state.adjustmentTimes.length == 0) {
            return (<div></div>)
        } else {
            const times = window.getSunCalcTimes(window.settings.adjustmentTimeLatitude, window.settings.adjustmentTimeLongitude)
            const lat = parseFloat(window.settings.adjustmentTimeLatitude) ?? 0
            const long = parseFloat(window.settings.adjustmentTimeLongitude) ?? 0
            const canShowSunCalc = ((lat > 0 || lat < 0) && (long > 0 || long < 0))

            return this.state.adjustmentTimes.map((time, index) => {
                let timeElem = (
                    <input type="time" min="00:00" max="23:59" onChange={(e) => {
                        this.setAdjustmentTimeValue(index, e.target.value)
                    }} value={time.time}></input>
                )
                if (time.useSunCalc) {
                    timeElem = (
                        <select value={time.sunCalc ?? "solarNoon"} onChange={e => {
                            time.sunCalc = e.target.value
                            this.updateAdjustmentTime(time, index)
                        }}>
                            <option value="dawn">Dawn ({times.dawn})</option>
                            <option value="sunrise">Sunrise ({times.sunrise})</option>
                            <option value="goldenHour">Golden Hour ({times.goldenHour})</option>
                            <option value="solarNoon">Solar Noon ({times.solarNoon})</option>
                            <option value="sunsetStart">Sunset Start ({times.sunsetStart})</option>
                            <option value="sunset">Sunset ({times.sunset})</option>
                            <option value="dusk">Dusk ({times.dusk})</option>
                            <option value="night">Night ({times.night})</option>
                        </select>
                    )
                }
                return (
                    <SettingsOption className="win10-has-background" key={index + "_" + time.time} content={
                        <div className="input-row">
                            {timeElem}
                            <input type="button" className="button button-primary" value={T.t("SETTINGS_TIME_REMOVE")} onClick={() => {
                                this.state.adjustmentTimes.splice(index, 1)
                                this.forceUpdate()
                                this.adjustmentTimesUpdated()
                            }} />
                        </div>
                    } input={
                        <div className="inputToggle-generic" style={{display: (canShowSunCalc ? "flex" : "none")}}>
                            <input onChange={e => {
                                time.useSunCalc = e.target.checked
                                this.updateAdjustmentTime(time, index)
                            }} checked={time.useSunCalc ?? false} data-checked={time.useSunCalc ?? false} type="checkbox" />
                            <div className="text">Use sun position</div>
                        </div>
                    }>
                        <SettingsChild>
                            {this.getAdjustmentTimesMonitors(time, index)}
                        </SettingsChild>
                    </SettingsOption>
                )
            })
        }

    }

    getAdjustmentTimesMonitors = (time, index) => {
        if (this.state.adjustmentTimeIndividualDisplays) {
            return Object.values(this.state.monitors).map((monitor, idx) => {
                if (monitor.type == "none") {
                    return (<div key={monitor.id + ".brightness"}></div>)
                } else {
                    let level = time.brightness
                    if (this.state.adjustmentTimes[index] && this.state.adjustmentTimes[index].monitors && this.state.adjustmentTimes[index].monitors[monitor.id] >= 0) {
                        level = this.state.adjustmentTimes[index].monitors[monitor.id]
                    } else {
                        // No value set, use shared value
                        this.state.adjustmentTimes[index].monitors[monitor.id] = level
                        this.adjustmentTimesUpdated()
                    }
                    return (<Slider key={monitor.id + ".brightness"} min={0} max={100} name={getMonitorName(monitor, this.state.names)} onChange={(value) => { this.getAdjustmentTimesMonitorsChanged(index, monitor, value) }} level={level} scrolling={false} />)
                }
            })
        } else {
            return (<Slider key={index + ".brightness"} name={T.t("GENERIC_ALL_DISPLAYS")} min={0} max={100} level={time.brightness} onChange={(value, slider) => { this.state.adjustmentTimes[index].brightness = value; this.forceUpdate(); this.adjustmentTimesUpdated() }} scrolling={false} />)
        }
    }

    getAdjustmentTimesMonitorsChanged = (index, monitor, value) => {
        if (this.state.adjustmentTimes[index].monitors === undefined) {
            this.state.adjustmentTimes[index].monitors = {}
        }
        this.state.adjustmentTimes[index].monitors[monitor.id] = value
        this.forceUpdate();
        this.adjustmentTimesUpdated()
    }


    setAdjustmentTimeValue = (index, arr) => {
        for (let i in arr) {
            if (i < 2 && isNaN(arr[i])) return false;
        }
        this.state.adjustmentTimes[index].time = arr

        //this.forceUpdate()
        this.adjustmentTimesUpdated()
    }

    getHotkeyList = () => {

        const deleteHotkeyAction = (idx, actionIdx) => {
            try {
                this.state.hotkeys[idx].actions.splice(actionIdx, 1)
                window.sendSettings({ hotkeys: this.state.hotkeys.slice() })
                this.forceUpdate()
            } catch(e) {
                console.log(e)
            }
        }

        return this.state.hotkeys?.map((hotkey, idx) => {
            return (
                <SettingsOption className="win10-has-background" key={hotkey.id} content={
                    <div className="row hotkey-combo-input">
                        <input placeholder={T.t("SETTINGS_HOTKEYS_PRESS_KEYS_HINT")} value={hotkey.accelerator} type="text" readOnly={true} onKeyDown={
                            (e) => {
                                e.preventDefault()
                                let key = cleanUpKeyboardKeys(e.key, e.keyCode)
                                if (this.downKeys[key] === undefined) {
                                    this.downKeys[key] = true;
                                    hotkey.accelerator = Object.keys(this.downKeys).join('+')
                                    this.updateHotkey(hotkey, idx);
                                }
                                return false
                            }
                        } onKeyUp={(e) => { delete this.downKeys[cleanUpKeyboardKeys(e.key, e.keyCode)] }} />
                        <input type="button" value={T.t("GENERIC_CLEAR")} onClick={() => {
                            this.downKeys = {}
                            hotkey.accelerator = ""
                            this.updateHotkey(hotkey, idx);
                        }} />
                        {this.getHotkeyStatusIcon(hotkey)}
                    </div>
                } expandable={true} input={
                    <a className="button button-primary" onClick={() => this.deleteHotkey(idx)}>{ deleteIcon } <span>Delete</span></a>
                }>
                    { hotkey.actions?.map((action, actionIdx) => {
                        return (
                            <SettingsChild key={`${idx}-${actionIdx}`}>
                                <ActionItem key={`${idx}-${actionIdx}`} title={`Action ${actionIdx + 1}`} action={action} onChange={updatedAction => this.updateHotkeyAction(updatedAction, idx, actionIdx)} onDelete={() => { deleteHotkeyAction(idx, actionIdx) }} monitors={this.state.monitors} monitorNames={this.state.names} />
                            </SettingsChild>
                        )
                    }) }
                    <SettingsChild>
                        <a className="button full-width" onClick={() => {
                            if(!hotkey.actions?.length) {
                                hotkey.actions = []
                            }
                            hotkey.actions.push(Object.assign({}, defaultAction))
                            this.updateHotkey(hotkey, idx)
                        }}>+ Add Action</a>
                    </SettingsChild>
                </SettingsOption>
            )
        })
    }

    getHotkeyStatusIcon = hotkey => {
        if (hotkey?.active) {
            return (<div className="status icon active">&#xE73E;</div>)
        } else {
            return (<div className="status icon inactive"></div>)
        }
    }

    updateHotkey(hotkey, idx) {
        this.state.hotkeys[idx] = Object.assign({}, hotkey)
        window.sendSettings({ hotkeys: this.state.hotkeys.slice() })
        this.forceUpdate()
    }

    updateHotkeyAction(action, idx, actionIdx) {
        this.state.hotkeys[idx].actions[actionIdx] = Object.assign({}, action)
        window.sendSettings({ hotkeys: this.state.hotkeys.slice() })
        this.forceUpdate()
    }

    deleteHotkey(idx) {
        this.state.hotkeys.splice(idx, 1)
        window.sendSettings({ hotkeys: this.state.hotkeys.slice() })
        this.forceUpdate()
    }


    getInfoMonitors = () => {
        if (this.state.monitors == undefined || Object.keys(this.state.monitors).length == 0) {
            return (<div className="no-displays-message">{T.t("GENERIC_NO_COMPATIBLE_DISPLAYS")}<br /><br /></div>)
        } else {
            return Object.values(this.state.monitors).map((monitor, index) => {

                let brightness = monitor.brightness
                let brightnessMax = monitor.brightnessMax

                if (monitor.type == "ddcci" && !monitor.brightnessType) {
                    brightness = "???"
                    brightnessMax = "???"
                }

                return (
                    <div key={monitor.key} className="monitorItem">
                        <br />
                        <div className="sectionSubtitle"><div className="icon">&#xE7F4;</div><div>{monitor.name}</div></div>
                        <p>Name: <b>{getMonitorName(monitor, this.state.names)}</b>
                            <br />Internal name: <b>{monitor.hwid[1]}</b>
                            <br />Communication Method: {this.getDebugMonitorType(monitor.type)}
                            <br />Current Brightness: <b>{(monitor.type == "none" ? "Not supported" : brightness)}</b>
                            <br />Max Brightness: <b>{(monitor.type !== "ddcci" ? "Not supported" : brightnessMax)}</b>
                            <br />Brightness Normalization: <b>{(monitor.type == "none" ? "Not supported" : monitor.min + " - " + monitor.max)}</b>
                        </p>
                    </div>
                )

            })
        }
    }


    getDebugMonitors = () => {
        if (this.state.monitors == undefined || Object.keys(this.state.monitors).length == 0) {
            return (<div className="no-displays-message">{T.t("GENERIC_NO_COMPATIBLE_DISPLAYS")}<br /><br /></div>)
        } else {
            return Object.values(this.state.monitors).map((monitor, index) => {

                return (
                    <MonitorInfo key={monitor.key} name={getMonitorName(monitor, this.state.names)} monitor={monitor} debug={true} />
                )

            })
        }
    }

    getFeaturesMonitors = () => {
        try {
            const onChange = () => {
                window.sendSettings({ monitorFeaturesSettings: JSON.parse(JSON.stringify(window.settings.monitorFeaturesSettings)) })
            }
            if (this.state.monitors == undefined || Object.keys(this.state.monitors).length == 0) {
                return (<div className="no-displays-message">{T.t("GENERIC_NO_COMPATIBLE_DISPLAYS")}<br /><br /></div>)
            } else {
                return Object.values(this.state.monitors).map((monitor, index) => {
                    const features = this.state?.rawSettings.monitorFeatures[monitor.hwid[1]]
                    return (
                        <MonitorFeatures key={monitor.key} name={getMonitorName(monitor, this.state.names)} monitor={monitor} monitorFeatures={features} toggleFeature={this.toggleFeature} T={T} onChange={onChange} onAddFeature={() => {
                            this.setState({
                                showAddFeatureOverlay: true,
                                addFeatureMonitor: monitor.hwid[1],
                                addFeatureValue: "",
                                addFeatureError: false
                            }, () => {
                                this.addFeatureInputRef.current.focus()
                            })
                        }} />
                    )

                })
            }
        } catch (e) {

        }
    }

    getHideMonitors = () => {
        try {
            if (this.state.monitors == undefined || Object.keys(this.state.monitors).length == 0) {
                return (<SettingsChild title={T.t("GENERIC_NO_COMPATIBLE_DISPLAYS")} />)
            } else {
                return Object.values(this.state.monitors).map((monitor, index) => {

                    return (
                        <SettingsChild key={monitor.key} icon="E7F4" title={getMonitorName(monitor, this.state.names)} input={
                            <div className="inputToggle-generic">
                                <input onChange={(e) => { this.setHideMonitor(e.target.checked, monitor) }} checked={(this.state.rawSettings?.hideDisplays?.[monitor.key] ? true : false)} data-checked={(this.state.rawSettings?.hideDisplays?.[monitor.key] ? true : false)} type="checkbox" />
                            </div>
                        } />
                    )

                })
            }
        } catch (e) {
            console.log(e)
        }
    }

    setHideMonitor = (value, monitor) => {
        const hideDisplays = Object.assign({}, this.state.rawSettings?.hideDisplays)
        hideDisplays[monitor.key] = value
        this.setSetting("hideDisplays", hideDisplays)
    }

    toggleFeature = (monitor, featureRaw) => {
        const feature = `0x${parseInt(featureRaw).toString(16).toUpperCase()}`

        if (feature === "0x10" || feature === "0x13") return false; // Skip brightness
        if (feature === "0x" || feature === "0xNaN") return false; // Skip invalid

        const newFeatures = Object.assign({}, this.state.rawSettings.monitorFeatures)
        if (!newFeatures[monitor]) newFeatures[monitor] = {};
        newFeatures[monitor][feature] = (newFeatures[monitor][feature] ? false : true);

        window.sendSettings({ monitorFeatures: newFeatures })
    }

    getDebugMonitorType = (type) => {
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






    // Update monitor info
    recievedMonitors = (e) => {
        let newMonitors = Object.assign(e.detail, {})
        this.lastLevels = []
        let numMonitors = 0
        for (let key in newMonitors) {
            if (newMonitors[key].type != "none") numMonitors++;
        }
        this.numMonitors = numMonitors
        this.setState({
            monitors: newMonitors
        })
    }

    // Update settings
    recievedSettings = (e) => {
        const settings = e.detail
        const openAtLogin = settings.openAtLogin
        const brightnessAtStartup = settings.brightnessAtStartup
        const linkedLevelsActive = (settings.linkedLevelsActive || false)
        const updateInterval = (settings.updateInterval || 500) * 1
        const remaps = (settings.remaps || {})
        const names = (settings.names || {})
        const adjustmentTimes = (settings.adjustmentTimes || {})
        const killWhenIdle = (settings.killWhenIdle || false)
        const order = (settings.order || [])
        const checkTimeAtStartup = (settings.checkTimeAtStartup || false)
        const checkForUpdates = (settings.checkForUpdates || false)
        const adjustmentTimeIndividualDisplays = (settings.adjustmentTimeIndividualDisplays || false)
        const language = (settings.language || "system")
        const hotkeys = (settings.hotkeys || [])
        const hotkeyPercent = (settings.hotkeyPercent || 10)
        const analytics = settings.analytics
        const useAcrylic = settings.useAcrylic
        const scrollShortcut = settings.scrollShortcut
        this.setState({
            rawSettings: (Object.keys(settings).length > 0 ? settings : this.state.rawSettings),
            openAtLogin,
            brightnessAtStartup,
            linkedLevelsActive,
            remaps,
            updateInterval,
            names,
            adjustmentTimes,
            killWhenIdle,
            order,
            checkTimeAtStartup,
            checkForUpdates,
            adjustmentTimeIndividualDisplays,
            language,
            hotkeys,
            hotkeyPercent,
            analytics,
            useAcrylic,
            scrollShortcut
        }, () => {
            this.forceUpdate()
        })
    }


    isSection = (name) => {
        if (this.state.activePage == name) {
            return true
        } else {
            return false
        }
    }

    isIcon = (icon) => (this.state.rawSettings.icon === icon ? true : false)

    addAdjustmentTime = () => {
        this.state.adjustmentTimes.push({
            brightness: 50,
            time: "12:30",
            monitors: {},
            useSunCalc: false,
            sunCalc: "sunrise"
        })
        this.forceUpdate()
        this.adjustmentTimesUpdated()
    }

    adjustmentTimesUpdated = () => {
        this.setState({ adjustmentTimes: this.state.adjustmentTimes.slice(0) })
        this.sendSettingsThrottle({ adjustmentTimes: this.state.adjustmentTimes.slice(0) })
        //window.sendSettings({ adjustmentTimes: this.state.adjustmentTimes })
    }

    setSetting = (setting, sentVal) => {
        let value = sentVal;
        if (sentVal === "on") value = true;
        if (sentVal === "off") value = false;

        const newState = {}
        newState[setting] = value
        this.setState(newState)
        window.sendSettings(newState)
    }

    renderToggle = (setting, showText = true, textSide = "right") => {
        return (<div className="inputToggle-generic" data-textside={textSide}>
            <input onChange={(e) => { this.setSetting(setting, e.target.checked) }} checked={(this.state.rawSettings?.[setting] ? true : false)} data-checked={(this.state.rawSettings?.[setting] ? true : false)} type="checkbox" />
            <div className="text">{(this.state.rawSettings?.[setting] ? T.t("GENERIC_ON") : T.t("GENERIC_OFF"))}</div>
        </div>)
    }

    render() {
        return (
            <SafeRender>
                <div className="window-base" data-theme={window.settings.theme || "default"}>
                    <Titlebar title={T.t("SETTINGS_TITLE")} />
                    <div className="window-base-inner">
                        <div id="sidebar">
                            {this.getSidebar()}
                        </div>
                        <div id="page" ref={this.settingsPageRef}>

                            <SettingsPage current={this.state.activePage} id="general">
                                <div className="pageSection">

                                    <div className="sectionTitle">{T.t("SETTINGS_GENERAL_TITLE")}</div>
                                    <SettingsOption title={T.t("SETTINGS_GENERAL_STARTUP")} input={this.renderToggle("openAtLogin")} />

                                    <SettingsOption title={T.t("SETTINGS_GENERAL_BRIGHTNESS_STARTUP_TITLE")} description={T.t("SETTINGS_GENERAL_BRIGHTNESS_STARTUP_DESC")} input={this.renderToggle("brightnessAtStartup")} />

                                    <SettingsOption title={T.t("SETTINGS_GENERAL_LANGUAGE_TITLE")} input={(
                                        <select value={window.settings.language} onChange={(e) => {
                                            this.setState({ language: e.target.value })
                                            window.sendSettings({ language: e.target.value })
                                        }}>
                                            <option value="system">{T.t("SETTINGS_GENERAL_LANGUAGE_SYSTEM")}</option>
                                            {this.getLanguages()}
                                        </select>
                                    )} />

                                    <SettingsOption title={T.t("SETTINGS_GENERAL_THEME_TITLE")} input={(
                                        <select value={window.settings.theme} onChange={this.themeChanged}>
                                            <option value="default">{T.t("SETTINGS_GENERAL_THEME_SYSTEM")}</option>
                                            <option value="dark">{T.t("SETTINGS_GENERAL_THEME_DARK")}</option>
                                            <option value="light">{T.t("SETTINGS_GENERAL_THEME_LIGHT")}</option>
                                        </select>
                                    )} />

                                    <SettingsOption title={"Windows UI Style"} input={(
                                        <select value={window.settings.windowsStyle} onChange={(e) => this.setSetting("windowsStyle", e.target.value)}>
                                            <option value="system">{T.t("SETTINGS_GENERAL_THEME_SYSTEM")}</option>
                                            <option value="win10">Windows 10</option>
                                            <option value="win11">Windows 11</option>
                                        </select>
                                    )} />

                                    <div className="win10only">
                                        <SettingsOption title={T.t("SETTINGS_GENERAL_ACRYLIC_TITLE")} description={T.t("SETTINGS_GENERAL_ACRYLIC_DESC")} input={this.renderToggle("useAcrylic")} />
                                    </div>

                                    <div className="win11only">
                                        <SettingsOption title={T.t("SETTINGS_GENERAL_MICA_TITLE")} description={T.t("SETTINGS_GENERAL_MICA_DESC")} input={this.renderToggle("useAcrylic")} />
                                    </div>

                                    <SettingsOption title={T.t("SETTINGS_GENERAL_TRAY_ICON_TITLE")} input={(
                                        <div className="icons-row">
                                            <div className="icon-option" data-active={this.isIcon("icon")} onClick={() => window.sendSettings({ icon: "icon" })}>
                                                <img src={DefaultIcon} />
                                            </div>
                                            <div className="icon-option" data-active={this.isIcon("mdl2")} onClick={() => window.sendSettings({ icon: "mdl2" })}>
                                                <img src={MDL2Icon} />
                                            </div>
                                            <div className="icon-option" data-active={this.isIcon("fluent")} onClick={() => window.sendSettings({ icon: "fluent" })}>
                                                <img src={FluentIcon} />
                                            </div>
                                        </div>
                                    )} />

                                    <SettingsOption title={T.t("SETTINGS_GENERAL_ANALYTICS_TITLE")} description={T.h("SETTINGS_GENERAL_ANALYTICS_DESC", '<a href="javascript:window.openURL(\'privacy-policy\')">' + T.t("SETTINGS_GENERAL_ANALYTICS_LINK") + '</a>')} input={this.renderToggle("analytics")} />

                                </div>

                                <div className="pageSection">
                                    <div className="sectionTitle">{T.t("SETTINGS_GENERAL_TROUBLESHOOTING")}</div>

                                    <SettingsOption title={T.t("SETTINGS_GENERAL_DIS_MONITOR_FEATURES_TITLE")} description={T.h("SETTINGS_GENERAL_DIS_MONITOR_FEATURES_DESC", '<a href="javascript:window.openURL(\'troubleshooting-features\')">' + T.t("SETTINGS_GENERAL_ANALYTICS_LINK") + '</a>')} expandable={true}>
                                        <SettingsChild title={"WMIC"} input={this.renderToggle("disableWMIC")} />
                                        <SettingsChild title={"WMI-Bridge"} input={this.renderToggle("disableWMI")} />
                                        <SettingsChild title={"Win32-DisplayConfig"} input={this.renderToggle("disableWin32")} />
                                    </SettingsOption>

                                    <SettingsOption title={"Default overlay behavior"} description={"How forcefully the brightness hotkey overlay will attempt to display over other apps. You should not need to adjust this."} input={
                                    <select value={window.settings.defaultOverlayType} onChange={(e) => this.setSetting("defaultOverlayType", e.target.value)}>
                                        <option value="disabled">Disabled</option>
                                        <option value="safe">Safe</option>
                                        <option value="aggressive">Aggressive</option>
                                    </select>
                                    } expandable={true}>
                                        <SettingsChild>
                                            <p><i>
                                                <b>Disabled:</b> Do not show overlay. <br />
                                                <b>Safe:</b> The overlay will display over most windows, but will not force itself above apps that are marked as "always on top". <br />
                                                <b>Aggressive:</b> Always try to show the overlay on top of other windows. This can cause issues with exclusive fullscreen games and other fullscreen apps. It can also trigger anti-cheat in some games.
                                            </i></p>
                                        </SettingsChild>
                                    </SettingsOption>

                                    <SettingsOption title={"Don't auto-apply brightness"} description={"If your monitor responds strangely after turning it off/or or disconnecting/connecting hardware, this may help."} input={this.renderToggle("disableAutoApply")} />

                                    <SettingsOption title={T.t("SETTINGS_GENERAL_RESET_TITLE")} description={T.t("SETTINGS_GENERAL_RESET_DESC")} input={<a className="button" onClick={window.resetSettings}>{T.t("SETTINGS_GENERAL_RESET_BUTTON")}</a>} />

                                </div>
                            </SettingsPage>

                            <SettingsPage current={this.state.activePage} id="time">
                                <div className="pageSection">
                                    <div className="sectionTitle">{T.t("SETTINGS_TIME_TITLE")}</div>
                                    <p>{T.t("SETTINGS_TIME_DESC")}</p>
                                    <div className="adjustmentTimes">
                                        {this.getAdjustmentTimes()}
                                    </div>
                                    <p><a className="button" onClick={this.addAdjustmentTime}>+ {T.t("SETTINGS_TIME_ADD")}</a></p>
                                </div>
                                <div className="pageSection">
                                    <SettingsOption title={"Coordinates for sun position"} description={"To use \"sun position\" for time adjustments, enter your current latitude and longitude so the correct times can be determined."} expandable={true}>
                                        <SettingsChild>
                                            <div style={{ "display": "flex" }}>
                                                <div style={{ marginRight: "6px", flex: 1 }}>
                                                    <label style={{ "textTransform": "capitalize" }}>Latitude</label>
                                                    <input type="number" min="-90" max="90" value={window.settings.adjustmentTimeLatitude * 1} onChange={(e) => this.setSetting("adjustmentTimeLatitude", e.target.value)} style={{width: "100%", boxSizing: "border-box"}} />
                                                </div>
                                                <div style={{flex: 1}}>
                                                    <label style={{ "textTransform": "capitalize" }}>Longitude</label>
                                                    <input type="number" min="-180" max="180" value={window.settings.adjustmentTimeLongitude * 1} onChange={(e) => this.setSetting("adjustmentTimeLongitude", e.target.value)} style={{width: "100%", boxSizing: "border-box"}} />
                                                </div>
                                                {/* I'll write better CSS later, I promise. */}
                                                <div><label style={{opacity:0}}>Get coordinates</label><input type="button" className="button" onClick={() => window.ipc.send("get-coordinates")} value="Get coordinates" style={{lineHeight:"1.3",padding:(document.body.dataset.isWin11 === 'true' ? "9px" : "8px"),marginLeft:"6px"}} /></div>
                                            </div>
                                        </SettingsChild>
                                    </SettingsOption>
                                    <SettingsOption title={T.t("SETTINGS_TIME_INDIVIDUAL_TITLE")} description={T.t("SETTINGS_TIME_INDIVIDUAL_DESC")} input={this.renderToggle("adjustmentTimeIndividualDisplays")} />
                                    <SettingsOption title={T.t("SETTINGS_TIME_ANIMATE_TITLE")} description={T.t("SETTINGS_TIME_ANIMATE_DESC")} input={this.renderToggle("adjustmentTimeAnimate")} />
                                    <SettingsOption title={T.t("SETTINGS_TIME_TRANSITON_TITLE")} description={T.t("SETTINGS_TIME_TRANSITON_DESC")} input={
                                        <select value={window.settings.adjustmentTimeSpeed} onChange={(e) => this.setSetting("adjustmentTimeSpeed", e.target.value)}>
                                            <option value="slowest">{T.t("GENERIC_SPEED_VERY_SLOW")}</option>
                                            <option value="slow">{T.t("GENERIC_SPEED_SLOW")}</option>
                                            <option value="normal">{T.t("GENERIC_SPEED_NORMAL")}</option>
                                            <option value="faster">{T.t("GENERIC_SPEED_FAST")}</option>
                                            <option value="fastest">{T.t("GENERIC_SPEED_VERY_FAST")}</option>
                                            <option value="instant">{T.t("GENERIC_SPEED_INSTANT")}</option>
                                        </select>
                                    } />
                                    <SettingsOption title={T.t("SETTINGS_TIME_STARTUP_TITLE")} description={T.t("SETTINGS_TIME_STARTUP_DESC")} input={this.renderToggle("checkTimeAtStartup")} />
                                </div>
                                <div className="pageSection">
                                    <div className="sectionTitle">{T.t("SETTINGS_TIME_IDLE_TITLE")}</div>
                                    <SettingsOption title={T.t("SETTINGS_TIME_IDLE_TITLE")} description={T.t("SETTINGS_TIME_IDLE_DESC")} input={this.renderToggle("detectIdleTimeEnabled")}>
                                        <SettingsChild content={
                                                <div style={{ "display": "flex" }}>
                                                    <div style={{ "marginRight": "6px" }}>
                                                        <label style={{ "textTransform": "capitalize" }}>{T.t("GENERIC_MINUTES")}</label>
                                                        <input type="number" min="0" max="600" value={window.settings.detectIdleTimeMinutes * 1} onChange={(e) => this.setSetting("detectIdleTimeMinutes", e.target.value)} />
                                                    </div>
                                                    <div>
                                                        <label style={{ "textTransform": "capitalize" }}>{T.t("GENERIC_SECONDS")}</label>
                                                        <input type="number" min="0" max="600" value={window.settings.detectIdleTimeSeconds * 1} onChange={(e) => this.setSetting("detectIdleTimeSeconds", e.target.value)} />
                                                    </div>
                                                </div>
                                            } />
                                    </SettingsOption>
                                </div>
                            </SettingsPage>


                            <SettingsPage current={this.state.activePage} id="monitors">

                                <div className="pageSection">
                                    <div className="sectionTitle">{T.t("GENERIC_ALL_DISPLAYS")}</div>
                                    <div className="monitorItem-list">
                                        {this.getInfoMonitors()}
                                    </div>
                                </div>

                                <div className="pageSection">
                                    <SettingsOption title={T.t("SETTINGS_MONITORS_RATE_TITLE")} description={T.t("SETTINGS_MONITORS_RATE_DESC")} input={(
                                        <select value={this.state.updateInterval} onChange={this.updateIntervalChanged}>
                                            <option value="100">{T.t("SETTINGS_MONITORS_RATE_0")}</option>
                                            <option value="250">{T.t("SETTINGS_MONITORS_RATE_1")}</option>
                                            <option value="500">{T.t("SETTINGS_MONITORS_RATE_2")}</option>
                                            <option value="1000">{T.t("SETTINGS_MONITORS_RATE_3")}</option>
                                            <option value="2000">{T.t("SETTINGS_MONITORS_RATE_4")}</option>
                                        </select>
                                    )} />
                                    <SettingsOption title={T.t("SETTINGS_MONITORS_HIDE_DISPLAYS_TITLE")} description={T.t("SETTINGS_MONITORS_HIDE_DISPLAYS_DESC")} expandable={true}>
                                        {this.getHideMonitors()}
                                    </SettingsOption>
                                    <SettingsOption title={T.t("SETTINGS_MONITORS_HIDE_INTERNAL_TITLE")} description={T.t("SETTINGS_MONITORS_HIDE_INTERNAL_DESC")} input={this.renderToggle("hideClosedLid")} />
                                    <SettingsOption title={T.t("SETTINGS_MONITORS_RENAME_TITLE")} description={T.t("SETTINGS_MONITORS_RENAME_DESC")} expandable={true}>
                                        {this.getRenameMonitors()}
                                    </SettingsOption>
                                    <SettingsOption title={T.t("SETTINGS_MONITORS_REORDER_TITLE")} description={T.t("SETTINGS_MONITORS_REORDER_DESC")} expandable={true}>
                                        <SettingsChild content={
                                            <div className="reorderList">
                                                {this.getReorderMonitors()}
                                            </div>
                                        } />
                                    </SettingsOption>
                                </div>

                                <div className="pageSection">
                                    <div className="sectionTitle">{T.t("SETTINGS_MONITORS_NORMALIZE_TITLE")}</div>
                                    <p>{T.t("SETTINGS_MONITORS_NORMALIZE_DESC")}</p>
                                    {this.getMinMaxMonitors()}
                                </div>

                            </SettingsPage>



                            <SettingsPage current={this.state.activePage} id="features">
                                <div className="pageSection">
                                    <div className="sectionTitle">{T.t("SETTINGS_SIDEBAR_FEATURES")}</div>
                                    <p>{T.t("SETTINGS_FEATURES_DESCRIPTION")}</p>
                                    {this.getFeaturesMonitors()}
                                </div>
                                <div className="pageSection">
                                    <SettingsOption title={T.t("SETTINGS_FEATURES_CUR_BRIGHTNESS_TITLE")} description={T.t("SETTINGS_FEATURES_CUR_BRIGHTNESS_DESC")} input={this.renderToggle("getDDCBrightnessUpdates")} />
                                    <SettingsOption title={"Power State Signal"} description={"When sending the DDC/CI command to turn off your display, the following value(s) will be sent."} input={
                                        <select value={this.state.rawSettings.ddcPowerOffValue} onChange={e => {
                                            this.setState({ ddcPowerOffValue: parseInt(e.target.value) })
                                            window.sendSettings({ ddcPowerOffValue: parseInt(e.target.value) })
                                        }}>
                                            <option value={4}>Standby (4) ⚠️</option>
                                            <option value={5}>Power off (5)</option>
                                            <option value={6}>Most compatible (4 &amp; 5)</option>
                                        </select>
                                    }>
                                        <SettingsChild description={<>⚠️ <em>The "Standby" option is more likely to allow toggling the monitor on/off from Twinkle Tray. However, many monitors do not respond correctly to changing power state. Use at your own risk.</em></>} />
                                    </SettingsOption>                                
                                </div>
                            </SettingsPage>





                            <SettingsPage current={this.state.activePage} id="hotkeys">
                                <div className="pageSection">
                                    <div className="sectionTitle">{T.t("SETTINGS_HOTKEYS_TITLE")}</div>
                                    <p>{T.t("SETTINGS_HOTKEYS_DESC")}</p>
                                    <div className="hotkey-monitors">
                                        {this.getHotkeyList()}
                                        <p><a className="button" onClick={() => {
                                            this.state.hotkeys.push({
                                                accelerator: "",
                                                actions: [
                                                    Object.assign({}, defaultAction)
                                                ],
                                                id: uuid()
                                            })
                                            window.sendSettings({ hotkeys: this.state.hotkeys.slice() })
                                            this.forceUpdate()
                                        }}>+ Add Hotkey</a></p>
                                    </div>

                                </div>

                                <div className="pageSection">
                                    <SettingsOption title={T.t("SETTINGS_HOTKEYS_BREAK_TITLE")} description={T.t("SETTINGS_HOTKEYS_BREAK_DESC")} input={this.renderToggle("hotkeysBreakLinkedLevels")} />
                                </div>

                                <div className="pageSection">
                                    <div className="sectionTitle">{T.t("SETTINGS_GENERAL_SCROLL_TITLE")}</div>
                                    <SettingsOption title={T.t("SETTINGS_GENERAL_SCROLL_TITLE")} description={T.t("SETTINGS_GENERAL_SCROLL_DESC")} input={this.renderToggle("scrollShortcut")}>
                                        <SettingsChild title={"Amount to scroll"} className="win10-stack-input" input={
                                            <input type="number" min={1} max={100} step={1}
                                            value={this.state.rawSettings.scrollShortcutAmount} onChange={e => {
                                                this.state.rawSettings.scrollShortcutAmount = parseInt(e.target.value)
                                                window.sendSettings({ scrollShortcutAmount: parseInt(e.target.value) })
                                                this.forceUpdate()
                                            }} />
                                        } />
                                    </SettingsOption>
                                </div>

                                <div className="pageSection">
                                    <div className="sectionTitle">{T.t("SETTINGS_HOTKEYS_TOD_TITLE")}</div>
                                    <SettingsOption title={T.t("SETTINGS_HOTKEYS_TOD_TITLE")} description={T.t("SETTINGS_HOTKEYS_TOD_DESC")} input={
                                        <select value={this.state.rawSettings.sleepAction} onChange={this.sleepActionChanged}>
                                            <option value="none">{T.t("SETTINGS_HOTKEYS_TOD_NONE")}</option>
                                            <option value="ps">{T.t("SETTINGS_HOTKEYS_TOD_SOFT")}</option>
                                            <option value="ddcci">{T.t("SETTINGS_HOTKEYS_TOD_HARD")}</option>
                                            <option value="ps_ddcci">{T.t("SETTINGS_HOTKEYS_TOD_BOTH")}</option>
                                        </select>
                                    }>
                                        <SettingsChild description={
                                            <div>
                                                <i>{T.t("SETTINGS_HOTKEYS_TOD_NOTE")}</i>
                                                { (this.state.rawSettings?.sleepAction === "ddcci" || this.state.rawSettings?.sleepAction === "ps_ddcci" ? (<div className="ddc-warning"><br />⚠️ <em>{T.t("GENERIC_DDC_WARNING")}</em></div>) : null) }
                                            </div>
                                        } />
                                    </SettingsOption>
                                    <p></p>

                                    
                                </div>

                                <div className="pageSection">
                                    <div className="sectionTitle">Profiles</div>
                                    <p>Automatically adjust the brightness or shortcut overlay behavior depending on the focused app. You can also add profiles to the right-click menu in the system tray to quickly change the brightness to pre-defined profiles.</p>
                                    <div className="hotkey-profiles">
                                        {this.state.rawSettings?.profiles?.map((profile, idx) => <AppProfile key={`${idx}__${profile.uuid}`} profile={profile} monitors={this.state.monitors} updateValue={(key, value) => {
                                            profile[key] = value
                                            sendSettings({ profiles: this.state.rawSettings?.profiles })
                                            this.forceUpdate()
                                        }}
                                            onDelete={
                                                () => {
                                                    this.state.rawSettings?.profiles.splice(idx, 1)
                                                    sendSettingsImmediate({ profiles: this.state.rawSettings?.profiles })
                                                    this.forceUpdate()
                                                }
                                            } />)}
                                        <p><a className="add-new button" onClick={() => addNewProfile(this.state)}>+ New Profile</a></p>
                                    </div>

                                </div>
                            </SettingsPage>



                            <SettingsPage current={this.state.activePage} id="updates">
                                <div className="pageSection">
                                    <div className="sectionTitle">{T.t("SETTINGS_UPDATES_TITLE")}</div>
                                    <p>{T.h("SETTINGS_UPDATES_VERSION", '<b>' + (window.version ? `${window.version}${window.versionTag && window.versionBuild ? ` (${window.versionBuild})` : ""}` : "not available") + '</b>')}</p>
                                    {this.getUpdate()}
                                </div>
                                <div className="pageSection" style={{ display: (window.isAppX ? "none" : (this.isSection("updates") ? "block" : "none")) }}>
                                    <SettingsOption title={T.t("SETTINGS_UPDATES_AUTOMATIC_TITLE")} description={T.t("SETTINGS_UPDATES_AUTOMATIC_DESC")} input={this.renderToggle("checkForUpdates")} />
                                    <SettingsOption title={T.t("SETTINGS_UPDATES_CHANNEL")} input={
                                        <select value={this.state.rawSettings.branch} onChange={(e) => { window.sendSettings({ branch: e.target.value }) }}>
                                            <option value="master">{T.t("SETTINGS_UPDATES_BRANCH_STABLE")}</option>
                                            <option value="beta">{T.t("SETTINGS_UPDATES_BRANCH_BETA")}</option>
                                        </select>
                                    } />
                                </div>
                            </SettingsPage>

                            <SettingsPage current={this.state.activePage} id="debug">
    

                                <div className="pageSection debug">
                                    <SettingsOption title="All Displays" expandable={true} input={<><a className="button" onClick={() => { window.requestMonitors(true) }}>Refresh Monitors</a> <a className="button" onClick={() => window.ipc.send('flush-vcp-cache')}>Clear Cache</a></>}>
                                        <SettingsChild>
                                            {this.getDebugMonitors()}
                                        </SettingsChild>
                                    </SettingsOption>   

                                    <SettingsOption title="Settings" description={window.settingsPath} input={<a className="button" onClick={() => window.ipc.send('open-settings-file')}>Open Settings</a>} expandable={true}>
                                        <SettingsChild>
                                            <p style={{ whiteSpace: "pre-wrap", fontFamily: '"Cascadia Code", "Consolas", sans-serif' }}>{JSON.stringify(this.state.rawSettings, undefined, 2)}</p>
                                        </SettingsChild>
                                    </SettingsOption>     
                                    
                                    <SettingsOption title="Raw Monitor Data" expandable={true}>
                                        <SettingsChild>
                                            <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(window.allMonitors, undefined, 2)}</pre>
                                        </SettingsChild>
                                    </SettingsOption>                               
                                </div>

                                <div className="pageSection debug">
                                    <div className="sectionTitle">Other</div>
    
                                    <SettingsOption title="Dev Mode" input={this.renderToggle("isDev")} />
                                    <SettingsOption title="UDP Server" expandable={true}>
                                        <SettingsChild title="Enable UDP commands outside of localhost" input={this.renderToggle("udpRemote")} />
                                        <SettingsChild title="Default port for UDP commands" input={<input type="number" min="1" max="65535" value={window.settings.udpPortStart * 1} onChange={(e) => this.setSetting("udpPortStart", e.target.value)} />} />
                                        <SettingsChild title={`Active port: ${window.settings.udpPortActive}`} />
                                        <SettingsChild title={`UDP key: ${window.settings.udpKey}`} />
                                    </SettingsOption>
                                    
                                    <SettingsOption title="DDC/CI Scanning Mode" description={`Last test result: ${settings?.lastDetectedDDCCIMethod}`} input={
                                        <select value={this.state.rawSettings.preferredDDCCIMethod} onChange={e => {
                                            window.sendSettings({ preferredDDCCIMethod: e.target.value })
                                        }}>
                                            <option value="auto">Auto</option>
                                            <option value="fast">Fast</option>
                                            <option value="accurate">Accurate</option>
                                            <option value="no-validation">No validation</option>
                                            <option value="legacy">Legacy (v1.15.4 behavior)</option>
                                        </select>
                                    } />
                                    <SettingsOption title="Disable Auto Refresh" description="Prevent last known brightness from read after certain hardware/user events." input={this.renderToggle("disableAutoRefresh")} />
                                    <SettingsOption title="Use Native Animation (depricated)" input={this.renderToggle("useNativeAnimation")} />
                                    <SettingsOption title="Use Taskbar Registry" input={this.renderToggle("useTaskbarRegistry")} />
                                    <SettingsOption title="Disable Mouse Events (requires restart)" input={this.renderToggle("disableMouseEvents")} />

                                </div>
                            </SettingsPage>




                        </div>
                    </div>

                    <div className="add-feature-overlay" data-show={this.state.showAddFeatureOverlay}>
                        <div className="inner">
                            <div className="input-row">
                                <div className="field">
                                    <p>Enter the VCP code for the feature you would like to add to your display. Please note that Twinkle Tray does not validate if your display actually supports this VCP code. Use at your own risk.</p>
                                    <label>VCP Code</label>
                                    <input type="text" placeholder="ex. 0x62" ref={this.addFeatureInputRef} value={this.state.addFeatureValue} onChange={e => this.setState({ addFeatureValue: e.target.value })} onKeyUp={e => {
                                        if (e.which === 13 && this.state.addFeatureValue) {
                                            // Enter
                                            this.addFeatureOKRef.current.click()
                                        } else if (e.which === 27) {
                                            // Escape
                                            this.addFeatureCancelRef.current.click()
                                        }
                                    }} />
                                </div>
                            </div>
                            <div className="input-row" style={{ display: (this.state.addFeatureError ? "block" : "none") }}>
                                <p><b>This feature is already active.</b></p>
                            </div>
                            <div className="input-row flex-end">
                                <input type="button" ref={this.addFeatureCancelRef} value={"Cancel"} className="button" onClick={() => this.setState({ showAddFeatureOverlay: false })} />
                                <input type="button" ref={this.addFeatureOKRef} value={"OK"} className="button" onClick={() => {
                                    let isActive = false
                                    const vcp = this.state.addFeatureValue.toUpperCase()
                                    try {
                                        isActive = this.state.rawSettings.monitorFeatures[this.state.addFeatureMonitor][vcp];
                                    } catch (e) { }
                                    if (isActive) {
                                        this.setState({ addFeatureError: true })
                                    } else {
                                        this.setState({ showAddFeatureOverlay: false })
                                        this.toggleFeature(this.state.addFeatureMonitor, vcp)
                                    }

                                }} />
                            </div>
                        </div>
                    </div>

                </div>
            </SafeRender>
        );
    }
}

function addNewProfile(state) {
    if (!state.rawSettings?.profiles) return false;
    const id = uuid()
    const profile = {
        id,
        uuid: uuid(),
        name: "",
        overlayType: "normal",
        setBrightness: false,
        monitors: {},
        showInMenu: false
    }
    state.rawSettings.profiles.push(profile)
    sendSettings({ profiles: state.rawSettings.profiles })
}

function getProfileMonitors(monitors, profile, onChange) {
    return Object.values(monitors).map((monitor, idx) => {
        if (monitor.type == "none") {
            return (null)
        } else {
            let level = (profile.monitors?.[monitor.id] ?? 50)
            return (<Slider key={monitor.id + ".brightness"} min={0} max={100} name={monitor.name} height="short" onChange={level => {
                profile.monitors[monitor.id] = level
                onChange(profile, monitor.id, level)
            }} level={level} scrolling={false} />)
        }
    })
}

function getMonitorName(monitor, renames) {
    if (Object.keys(renames).indexOf(monitor.id) >= 0 && renames[monitor.id] != "") {
        return renames[monitor.id] + ` (${monitor.name})`
    } else {
        return monitor.name
    }
}

function AppProfile(props) {
    const { profile, updateValue, onDelete, monitors } = props
    if (!profile.monitors) profile.monitors = {};

    return (
        <SettingsOption title={profile.name ?? "New Profile"} expandable={true} input={<a className="add-new button button-primary block" onClick={onDelete}>{ deleteIcon } <span>Delete</span></a>} className="appProfileItem win10-has-background" key={profile.id}>
            <SettingsChild>
                <div className="option-title">General Settings</div><br />
                <label>Profile name</label>
                <input type="text" placeholder="Profile Name" value={profile.name} onChange={e => updateValue("name", e.target.value)} style={{width:"100%"}}></input>
                <div className="feature-toggle-row">
                    <input onChange={(e) => { updateValue("setBrightness", e.target.checked) }} checked={profile.setBrightness} data-checked={profile.setBrightness} type="checkbox" />
                    <div className="feature-toggle-label"><span>Set brightness when active</span></div>
                </div>

                <div className="profile-monitors">
                    {(profile.setBrightness ? getProfileMonitors(monitors, profile, profile => updateValue("monitors", profile.monitors)) : null)}
                </div>

                {(profile.setBrightness ? (
                    <div className="feature-toggle-row">
                        <input onChange={(e) => { updateValue("showInMenu", e.target.checked) }} checked={profile.showInMenu} data-checked={profile.showInMenu} type="checkbox" />
                        <div className="feature-toggle-label"><span>Show in right-click tray menu</span></div>
                    </div>
                ) : null)}
            </SettingsChild>
            <SettingsChild>
                <div className="option-title">App trigger settings (optional)</div>
                <br />

                <label>App path</label>
                <p>If you want this profile to activate automatically when a specific app is focused, enter the full or partial path of the EXE below.</p>
                <input type="text" placeholder="App Path" value={profile.path} onChange={e => updateValue("path", e.target.value)} style={{width:"100%"}}></input>
                <label>Override overlay type</label>
                <p>Changes the behavior of the hotkey overlay when the specified app is focused. This feature does not work when the profile is manually activated.</p>
                <select value={profile.overlayType} onChange={e => updateValue("overlayType", e.target.value)}>
                    <option value="normal">Default</option>
                    <option value="safe">Safe</option>
                    <option value="disabled">Disabled</option>
                    <option value="aggressive">Aggressive</option>
                </select>
            </SettingsChild>
        </SettingsOption>
    )
}

function SettingsPage(props) {
    if (props.current === props.id) {
        return (
            <SafeRender><div className="settings-page">{props.children}</div></SafeRender>
        )
    }
    return null
}

function ActionItem(props) {
    const { action, monitors, monitorNames } = props
    const showDisplaysList = (action.type != "off" && action.type != "refresh")

    const getHotkeyMonitors = () => {
        try {
            if(action.allMonitors) return (null)
            if (monitors == undefined || Object.keys(monitors).length == 0) {
                return (<div className="no-displays-message option-description" style={{lineHeight:1.35}}>{T.t("GENERIC_NO_COMPATIBLE_DISPLAYS")}</div>)
            } else {
                return Object.values(monitors).map((monitor, index) => {
                    if(monitor.type !== "ddcci") return null;
                    return (
                        <div key={monitor.key} className="feature-toggle-row">
                            <input onChange={e => {
                                if (!action.monitors) action.monitors = {};
                                action.monitors[monitor.id] = e.target.checked
                                props.onChange?.(action)
                            }} checked={(action.monitors?.[monitor.id] ? true : false)} data-checked={(action.monitors?.[monitor.id] ? true : false)} type="checkbox" />
                            <div className="feature-toggle-label" style={{ display: "flex", alignItems: "center", gap: "8px" }}>{getMonitorName(monitor, monitorNames)}</div>
                        </div>
                    )

                })
            }
        } catch (e) {
            console.log(e)
        }
    }

    const getHotkeyInput = () => {
        if (action.type === "off") {
            return (<div className="input-row"><p style={{lineHeight: 1.2}}>This action will use the option selected under <b>Turn Off Displays action</b>. If you wish to turn off specific displays instead, use the "Set" or "Cycle" Hotkey Action instead.</p></div>)
        } else if (action.type === "refresh") {
            return null
        } else {
            let selectBoxValue = action.target
            if (!(selectBoxValue === "brightness" || selectBoxValue === "contrast" || selectBoxValue === "volume" || selectBoxValue === "powerState")) {
                selectBoxValue = "vcp"
            }
            const selectBox = (
                <div className="field">
                    <label>Action Target</label>
                    <select value={selectBoxValue} onChange={e => {
                        const value = e.target.value
                        if (value === "vcp") {
                            action.target = ""
                        } else {
                            action.target = value
                        }
                        props.onChange?.(action)
                    }}>
                        <option value="brightness">Brightness</option>
                        <option value="contrast">Contrast (if supported)</option>
                        <option value="volume">Volume (if supported)</option>
                        <option value="vcp">Specific VCP code</option>
                    </select>
                </div>
            )

            const singleValue = () => (
                <div className="input-row hotkey-action-value">
                    <div className="hotkey-value field">
                        <label>Value</label>
                        <input type="number" min="-65535" max="65535" value={action.value ?? 0} placeholder={`Enter a number`} onChange={e => {
                            const value = e.target.value
                            action.value = value ?? 0
                            props.onChange?.(action)
                        }} />
                    </div>
                </div>
            )

            const listOfValues = () => (
                <div className="input-row hotkey-action-values">
                    <div className="hotkey-values-list">
                        <label>Values</label>
                        {action.values?.map((value, idx2) => {
                            return (
                                <div className="hotkey-value" key={idx2}>
                                    <input type="number" min="-65535" max="65535" value={value ?? 0} placeholder={`Enter a number`}
                                        onChange={e => {
                                            const value = e.target.value
                                            action.values[idx2] = value ?? 0
                                            props.onChange?.(action)
                                        }} />
                                    {idx2 ? (
                                        <input type="button" className="button" onClick={() => {
                                            action.values.splice(idx2, 1)
                                            props.onChange?.(action)
                                        }} value={"Remove"} />
                                    ) : null}
                                </div>
                            )
                        })}
                        <p><a className="button button-primary" onClick={() => {
                            action.values.push([0])
                            props.onChange?.(action)
                        }}>+ Add Value</a></p>
                    </div>
                </div>
            )

            return (
                <>
                    <div className="input-row hotkey-action-type">
                        {selectBox}
                    </div>
                    <div className="input-row hotkey-action-code" style={{ display: (selectBoxValue === "vcp" ? "block" : "none") }}>
                        <div className="field">
                            <label>VCP Code</label>
                            <input value={action.target} type="text" placeholder={`VCP code (Ex. 16 or 0x10)`} onChange={e => {
                                action.target = e.target.value
                                props.onChange?.(action)
                            }} />
                        </div>
                    </div>
                    {action.type === "cycle" ? listOfValues() : singleValue()}
                </>
            )
        }
    }

    return (
        <div className="action-item-base">
            { props.onDelete ?
                <div className=""><a className="button button-primary" onClick={() => props.onDelete?.(action)}>{deleteIcon} <span>Delete {props.title ?? "Action"}</span></a><br /><br /></div>
            : <div className="option-title">{props.title ?? "Action"}</div> }
            
            
            <div className="input-row">
                <div className="hotkey-monitors-list" style={{ display: (showDisplaysList ? "block" : "none") }}>
                    <div className="input-row">
                        <div className="field">
                            <label style={{ marginBottom: "8px" }}>Displays</label>
                            <div className="feature-toggle-row">
                                <input onChange={e => {
                                    action.allMonitors = e.target.checked
                                    props.onChange?.(action)
                                }} checked={action.allMonitors} data-checked={action.allMonitors} type="checkbox" />
                                <div className="feature-toggle-label">All Displays</div>
                            </div>
                            {getHotkeyMonitors()}
                        </div>
                    </div>
                </div>
                <div className="hotkey-action-fields">
                    <div className="input-row">
                        <div className="field">
                            <label>Action</label>
                            <select value={action.type} onChange={e => {
                                action.type = e.target.value
                                props.onChange?.(action)
                            }}>
                                <option value="set">Set value</option>
                                <option value="offset">Adjust value</option>
                                <option value="cycle">Cycle list of values</option>
                                <option value="off">Turn off displays</option>
                                <option value="refresh">Refresh displays</option>
                            </select>
                        </div>
                    </div>
                    {getHotkeyInput()}
                </div>
            </div>
        </div>
    )
}
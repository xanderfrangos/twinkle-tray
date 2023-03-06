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

import DefaultIcon from "../assets/tray-icons/dark/icon@4x.png"
import MDL2Icon from "../assets/tray-icons/dark/mdl2@4x.png"
import FluentIcon from "../assets/tray-icons/dark/fluent@4x.png"

const uuid = require('uuid/v4');

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

let T = new TranslateReact({}, {})

export default class SettingsWindow extends PureComponent {

    constructor(props) {
        super(props)
        this.state = {
            rawSettings: {},
            activePage: 'general',
            theme: 'default',
            openAtLogin: false,
            brightnessAtStartup: true,
            monitors: [],
            remaps: [],
            names: [],
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
            windowHistory: []
        }
        this.numMonitors = 0
        this.downKeys = {}
        this.lastLevels = []
        this.onDragEnd = this.onDragEnd.bind(this);
        this.sendSettingsTimeout = false
        this.sendSettingsValues = {}
    }

    sendSettingsThrottle = (newSetting = {}) => {
        this.sendSettingsValues = Object.assign(this.sendSettingsValues, newSetting)
        if(this.sendSettingsTimeout) {
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
        window.addEventListener("localizationUpdated", (e) => { this.setState({ languages: e.detail.languages }); console.log(e.detail); T.setLocalizationData(e.detail.desired, e.detail.default) })
        window.addEventListener("windowHistory", e => this.setState({windowHistory: e.detail }))

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
        console.log(value, slider, this.state.remaps)

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
            return (<div key={item.id} className="item" data-active={this.isSection(item.id)} data-type={item.type || "none"} onClick={() => { this.setState({ activePage: item.id }); window.reloadReactMonitors(); window.requestMonitors(); }}>
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
                        <div key={monitor.id}>
                            <br />
                            <div className="sectionSubtitle"><div className="icon">&#xE7F4;</div><div>{this.getMonitorName(monitor, this.state.names)}</div></div>
                            <label>{T.t("GENERIC_MINIMUM")}</label>
                            <Slider key={monitor.id + ".min"} type="min" monitorID={monitor.id} level={remap.min} monitorName={monitor.name} monitortype={monitor.type} onChange={this.minMaxChanged} scrolling={false} />
                            <label>{T.t("GENERIC_MAXIMUM")}</label>
                            <Slider key={monitor.id + ".max"} type="max" monitorID={monitor.id} level={remap.max} monitorName={monitor.name} monitortype={monitor.type} onChange={this.minMaxChanged} scrolling={false} />
                        </div>

                    )
                }
            })
        }
    }

    getRenameMonitors = () => {
        if (this.state.monitors == undefined || Object.keys(this.state.monitors).length == 0) {
            return (<div className="no-displays-message">{T.t("GENERIC_NO_COMPATIBLE_DISPLAYS")}<br /><br /></div>)
        } else {
            return Object.values(this.state.monitors).map((monitor, index) => {
                if (monitor.type == "none") {
                    return (<div key={monitor.id}></div>)
                } else {
                    return (
                        <div key={monitor.id}>
                            <br />
                            <div className="sectionSubtitle"><div className="icon">&#xE7F4;</div><div>{monitor.name}</div></div>
                            <input type="text" placeholder={T.t("SETTINGS_MONITORS_ENTER_NAME")} data-key={monitor.key} onChange={this.monitorNameChange} value={(this.state.names[monitor.id] ? this.state.names[monitor.id] : "")}></input>
                        </div>
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
                                                        <div className="sectionSubtitle"><div className="icon">&#xE7F4;</div><div>{this.getMonitorName(monitor, this.state.names)}</div></div>
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

    getAdjustmentTimes = () => {
        if (this.state.adjustmentTimes == undefined || this.state.adjustmentTimes.length == 0) {
            return (<div></div>)
        } else {
            return this.state.adjustmentTimes.map((time, index) => {
                return (
                    <div className="item" key={index + "_" + time.time}>
                        <div className="row">
                            <input type="time" min="00:00" max="23:59" onChange={(e) => {
                                console.log("OUTVAL", e.target.value)
                                this.setAdjustmentTimeValue(index, e.target.value)
                            }} value={time.time}></input>
                            <a className="button" onClick={() => {
                                this.state.adjustmentTimes.splice(index, 1)
                                this.forceUpdate()
                                this.adjustmentTimesUpdated()
                            }}>{T.t("SETTINGS_TIME_REMOVE")}</a>
                        </div>
                        <div className="row">
                            {this.getAdjustmentTimesMonitors(time, index)}

                        </div>
                    </div>
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
                    return (<Slider key={monitor.id + ".brightness"} min={0} max={100} name={this.getMonitorName(monitor, this.state.names)} onChange={(value) => { this.getAdjustmentTimesMonitorsChanged(index, monitor, value) }} level={level} scrolling={false} />)
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
        console.log(this.state.adjustmentTimes[index].monitors)
        this.forceUpdate();
        this.adjustmentTimesUpdated()
    }


    setAdjustmentTimeValue = (index, arr) => {
        for (let i in arr) {
            console.log(arr[i])
            if (i < 2 && isNaN(arr[i])) return false;
        }
        this.state.adjustmentTimes[index].time = arr

        //this.forceUpdate()
        this.adjustmentTimesUpdated()
    }

    getHotkeyMonitor = (displayName, id) => {
        return (
            <div key={id} className="hotkey-item">
                <div className="sectionSubtitle"><div className="icon">&#xE7F4;</div><div>{displayName}</div></div>
                <div className="title">{T.t("SETTINGS_HOTKEYS_INCREASE")}</div>
                <div className="row"><input placeholder={T.t("SETTINGS_HOTKEYS_PRESS_KEYS_HINT")} value={this.findHotkey(id, 1)} type="text" readOnly={true} onKeyDown={
                    (e) => {
                        e.preventDefault()
                        let key = cleanUpKeyboardKeys(e.key, e.keyCode)
                        if (this.downKeys[key] === undefined) {
                            this.downKeys[key] = true;
                            this.updateHotkey(id, this.downKeys, 1);
                        }
                        return false
                    }
                } onKeyUp={(e) => { delete this.downKeys[cleanUpKeyboardKeys(e.key, e.keyCode)] }} />
                    <input type="button" value={T.t("GENERIC_CLEAR")} onClick={() => {
                        this.downKeys = {}
                        delete this.state.hotkeys[id + "__dir" + 1]
                        window.sendSettings({ hotkeys: this.state.hotkeys })
                        this.forceUpdate()
                    }} />
                    {this.getHotkeyStatusIcon(id, 1)}
                </div>
                <div className="title">{T.t("SETTINGS_HOTKEYS_DECREASE")}</div>
                <div className="row"><input placeholder={T.t("SETTINGS_HOTKEYS_PRESS_KEYS_HINT")} value={this.findHotkey(id, -1)} type="text" readOnly={true} onKeyDown={
                    (e) => {
                        e.preventDefault()
                        let key = cleanUpKeyboardKeys(e.key, e.keyCode)
                        if (this.downKeys[key] === undefined) {
                            this.downKeys[key] = true;
                            this.updateHotkey(id, this.downKeys, -1);
                        }
                        return false
                    }
                } onKeyUp={(e) => { delete this.downKeys[cleanUpKeyboardKeys(e.key, e.keyCode)] }} />
                    <input type="button" value={T.t("GENERIC_CLEAR")} onClick={() => {
                        this.downKeys = {}
                        delete this.state.hotkeys[id + "__dir" + -1]
                        window.sendSettings({ hotkeys: this.state.hotkeys })
                        this.forceUpdate()
                    }} />
                    {this.getHotkeyStatusIcon(id, -1)}
                </div>
                {this.getSleepHotkey(id)}
            </div>
        )
    }

    getSleepHotkey = (id) => {
        if (id == "all") {
            return (<>
                <div className="title">{T.t("PANEL_BUTTON_TURN_OFF_DISPLAYS")}</div>
                <div className="row"><input placeholder={T.t("SETTINGS_HOTKEYS_PRESS_KEYS_HINT")} value={this.findHotkey("turn_off_displays", 1)} type="text" readOnly={true} onKeyDown={
                    (e) => {
                        e.preventDefault()
                        let key = cleanUpKeyboardKeys(e.key, e.keyCode)
                        if (this.downKeys[key] === undefined) {
                            this.downKeys[key] = true;
                            this.updateHotkey("turn_off_displays", this.downKeys, 1);
                        }
                        return false
                    }
                } onKeyUp={(e) => { delete this.downKeys[cleanUpKeyboardKeys(e.key, e.keyCode)] }} />
                    <input type="button" value={T.t("GENERIC_CLEAR")} onClick={() => {
                        this.downKeys = {}
                        delete this.state.hotkeys["turn_off_displays" + "__dir" + 1]
                        window.sendSettings({ hotkeys: this.state.hotkeys })
                        this.forceUpdate()
                    }} />
                    {this.getHotkeyStatusIcon("turn_off_displays", 1)}
                </div>
            </>)
        } else {
            return (<></>)
        }
    }

    getHotkeyStatusIcon = (id, direction) => {
        if (this.state.hotkeys && this.state.hotkeys[id + "__dir" + direction]) {
            const status = this.state.hotkeys[id + "__dir" + direction].active
            if (status) {
                return (<div className="status icon active">&#xE73E;</div>)
            } else {
                return (<div className="status icon inactive"></div>)
            }
        }
    }

    getHotkeyMonitors = () => {
        return Object.values(this.state.monitors).slice(0).sort(monitorSort).map((monitor, idx) => {
            if (monitor.type == "none") {
                return (<div key={monitor.id}></div>)
            } else {
                return this.getHotkeyMonitor(this.getMonitorName(monitor, this.state.names), monitor.id)
            }
        })
    }

    findHotkey = (id, direction) => {
        if (this.state.hotkeys && this.state.hotkeys[id + "__dir" + direction]) {
            return this.state.hotkeys[id + "__dir" + direction].accelerator
        }
        return ""
    }



    updateHotkey(id, keys, direction) {
        const hotkey = {
            monitor: id,
            accelerator: Object.keys(keys).join('+'),
            direction,
            active: false
        }

        const key = id + "__dir" + direction
        this.state.hotkeys[key] = hotkey
        window.sendSettings({ hotkeys: { ...this.state.hotkeys } })
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
                    <div key={monitor.key}>
                        <br />
                        <div className="sectionSubtitle"><div className="icon">&#xE7F4;</div><div>{monitor.name}</div></div>
                        <p>Name: <b>{this.getMonitorName(monitor, this.state.names)}</b>
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
                    <MonitorInfo key={monitor.key} name={this.getMonitorName(monitor, this.state.names)} monitor={monitor} debug={true} />
                )

            })
        }
    }

    getFeaturesMonitors = () => {
        try {
            if (this.state.monitors == undefined || Object.keys(this.state.monitors).length == 0) {
                return (<div className="no-displays-message">{T.t("GENERIC_NO_COMPATIBLE_DISPLAYS")}<br /><br /></div>)
            } else {
                return Object.values(this.state.monitors).map((monitor, index) => {
                    const features = this.state?.rawSettings.monitorFeatures[monitor.hwid[1]]
                    return (
                        <MonitorFeatures key={monitor.key} name={this.getMonitorName(monitor, this.state.names)} monitor={monitor} monitorFeatures={features} toggleFeature={this.toggleFeature} T={T} />
                    )
    
                })
            }
        } catch(e) {

        }
    }

    getHideMonitors = () => {
        try {
            if (this.state.monitors == undefined || Object.keys(this.state.monitors).length == 0) {
                return (<div className="no-displays-message">{T.t("GENERIC_NO_COMPATIBLE_DISPLAYS")}<br /><br /></div>)
            } else {
                return Object.values(this.state.monitors).map((monitor, index) => {

                    return (
                        <div key={monitor.key} className="inputToggle-generic">
                            <input onChange={(e) => {this.setHideMonitor(e.target.checked, monitor)}}  checked={(this.state.rawSettings?.hideDisplays?.[monitor.key] ? true : false)} data-checked={(this.state.rawSettings?.hideDisplays?.[monitor.key] ? true : false)} type="checkbox" />
                            <div className="text" style={{display:"flex", alignItems:"center", gap:"8px"}}>{this.getMonitorName(monitor, this.state.names)}</div>
                        </div>
                    )
    
                })
            }
        } catch(e) {
            console.log(e)
        }
    }

    setHideMonitor = (value, monitor) => {
        const hideDisplays = Object.assign({}, this.state.rawSettings?.hideDisplays)
        hideDisplays[monitor.key] = value
        this.setSetting("hideDisplays", hideDisplays)
    }

    toggleFeature = (monitor, feature) => {
        const newFeatures = Object.assign({}, this.state.rawSettings.monitorFeatures)
        if(!newFeatures[monitor]) newFeatures[monitor] = {};
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
        const hotkeys = (settings.hotkeys || {})
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
            monitors: {}
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
        if(sentVal === "on") value = true;
        if(sentVal === "off") value = false;

        const newState = {}
        newState[setting] = value
        this.setState(newState)
        window.sendSettings(newState)
    }

    renderToggle = (setting, showText = true) => {
        return(<div className="inputToggle-generic">
            <input onChange={(e) => {this.setSetting(setting, e.target.checked)}} checked={(this.state.rawSettings?.[setting] ? true : false)} data-checked={(this.state.rawSettings?.[setting] ? true : false)} type="checkbox" />
            <div className="text">{(this.state.rawSettings?.[setting] ? T.t("GENERIC_ON") : T.t("GENERIC_OFF") )}</div>
        </div>)
    }

    render() {
        const { rawSettings } = this.state
        return (
            <div className="window-base" data-theme={window.settings.theme || "default"}>
                <Titlebar title={T.t("SETTINGS_TITLE")} />
                <div className="window-base-inner">
                    <div id="sidebar">
                        {this.getSidebar()}
                    </div>
                    <div id="page">
                        <div className="pageSection" data-active={this.isSection("general")}>
                            <div className="sectionTitle">{T.t("SETTINGS_GENERAL_TITLE")}</div>
                            <div style={{ display: (window.isAppX ? "none" : "block") }}>
                                <label>{T.t("SETTINGS_GENERAL_STARTUP")}</label>
                                { this.renderToggle("openAtLogin") }
                                <br />
                            </div>
                            <div>
                                <label>{T.t("SETTINGS_GENERAL_BRIGHTNESS_STARTUP_TITLE")}</label>
                                <p>{T.t("SETTINGS_GENERAL_BRIGHTNESS_STARTUP_DESC")}</p>
                                { this.renderToggle("brightnessAtStartup") }
                                <br />
                            </div>
                            <label>{T.t("SETTINGS_GENERAL_LANGUAGE_TITLE")}</label>
                            <select value={window.settings.language} onChange={(e) => {
                                this.setState({ language: e.target.value })
                                window.sendSettings({ language: e.target.value })
                            }}>
                                <option value="system">{T.t("SETTINGS_GENERAL_LANGUAGE_SYSTEM")}</option>
                                {this.getLanguages()}
                            </select>
                            <br /><br />
                            <label>{T.t("SETTINGS_GENERAL_THEME_TITLE")}</label>
                            <select value={window.settings.theme} onChange={this.themeChanged}>
                                <option value="default">{T.t("SETTINGS_GENERAL_THEME_SYSTEM")}</option>
                                <option value="dark">{T.t("SETTINGS_GENERAL_THEME_DARK")}</option>
                                <option value="light">{T.t("SETTINGS_GENERAL_THEME_LIGHT")}</option>
                            </select>
                            <br /><br />
                            <label>Windows UI Style</label>
                            <select value={window.settings.windowsStyle} onChange={(e) => this.setSetting("windowsStyle", e.target.value)}>
                                <option value="system">{T.t("SETTINGS_GENERAL_THEME_SYSTEM")}</option>
                                <option value="win10">Windows 10</option>
                                <option value="win11">Windows 11</option>
                            </select>
                            <br /><br />
                            <label className="win10only">{T.t("SETTINGS_GENERAL_ACRYLIC_TITLE")}</label>
                            <p className="win10only">{T.t("SETTINGS_GENERAL_ACRYLIC_DESC")}</p>
                            <label className="win11only">{T.t("SETTINGS_GENERAL_MICA_TITLE")}</label>
                            <p className="win11only">{T.t("SETTINGS_GENERAL_MICA_DESC")}</p>
                            { this.renderToggle("useAcrylic") }

                            <br />
                            <label>{T.t("SETTINGS_GENERAL_TRAY_ICON_TITLE")}</label>
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
                            <br />
                            <label>{T.t("SETTINGS_GENERAL_ANALYTICS_TITLE")}</label>
                            <p>{T.h("SETTINGS_GENERAL_ANALYTICS_DESC", '<a href="javascript:window.openURL(\'privacy-policy\')">' + T.t("SETTINGS_GENERAL_ANALYTICS_LINK") + '</a>')}</p>
                            { this.renderToggle("analytics") }
                        </div>
                        <div className="pageSection" data-active={this.isSection("general")}>
                            <div className="sectionTitle">{T.t("SETTINGS_GENERAL_TROUBLESHOOTING")}</div>
                            <label>{T.t("SETTINGS_GENERAL_DIS_MONITOR_FEATURES_TITLE")}</label>
                            <p>{T.h("SETTINGS_GENERAL_DIS_MONITOR_FEATURES_DESC", '<a href="javascript:window.openURL(\'troubleshooting-features\')">' + T.t("SETTINGS_GENERAL_ANALYTICS_LINK") + '</a>')}</p>
                            <div className="feature-toggle-list">
                                <div className="feature-toggle-row">
                                 <input onChange={(e) => {this.setSetting("disableWMIC", e.target.checked)}} checked={(this.state.rawSettings?.["disableWMIC"] ? true : false)} data-checked={(this.state.rawSettings?.["disableWMIC"] ? true : false)} type="checkbox" />
                                    <div className="feature-toggle-label"><span>WMIC</span></div>
                                </div>
                                <div className="feature-toggle-row">
                                    <input onChange={(e) => {this.setSetting("disableWMI", e.target.checked)}} checked={(this.state.rawSettings?.["disableWMI"] ? true : false)} data-checked={(this.state.rawSettings?.["disableWMI"] ? true : false)} type="checkbox" />
                                    <div className="feature-toggle-label"><span>WMI-Bridge</span></div>
                                </div>
                                <div className="feature-toggle-row">
                                    <input onChange={(e) => {this.setSetting("disableWin32", e.target.checked)}} checked={(this.state.rawSettings?.["disableWin32"] ? true : false)} data-checked={(this.state.rawSettings?.["disableWin32"] ? true : false)} type="checkbox" />
                                    <div className="feature-toggle-label"><span>Win32-DisplayConfig</span></div>
                                </div>
                            </div>
                            <br />
                            <label>{T.t("SETTINGS_GENERAL_DIS_OVERLAY_TITLE")}</label>
                            <p>{T.h("SETTINGS_GENERAL_DIS_OVERLAY_DESC")}</p>
                            { this.renderToggle("disableOverlay") }
                            <br />
                            <label>{T.t("SETTINGS_GENERAL_RESET_TITLE")}</label>
                            <p>{T.t("SETTINGS_GENERAL_RESET_DESC")}</p>
                            
                            <div style={{paddingBottom:"8px"}}><a className="button" onClick={window.resetSettings}>{T.t("SETTINGS_GENERAL_RESET_BUTTON")}</a></div>
                        </div>




                        <div className="pageSection" data-active={this.isSection("time")}>
                            <div className="sectionTitle">{T.t("SETTINGS_TIME_TITLE")}</div>
                            <p>{T.t("SETTINGS_TIME_DESC")}</p>
                            <p><br /><a className="button" onClick={this.addAdjustmentTime}>+ {T.t("SETTINGS_TIME_ADD")}</a></p>
                            <div className="adjustmentTimes">
                                {this.getAdjustmentTimes()}
                            </div>
                        </div>
                        <div className="pageSection" data-active={this.isSection("time")}>
                            <label>{T.t("SETTINGS_TIME_INDIVIDUAL_TITLE")}</label>
                            <p>{T.t("SETTINGS_TIME_INDIVIDUAL_DESC")}</p>
                            { this.renderToggle("adjustmentTimeIndividualDisplays") }
                        </div>
                        <div className="pageSection" data-active={this.isSection("time")}>
                            <label>{T.t("SETTINGS_TIME_ANIMATE_TITLE")}</label>
                            <p>{T.t("SETTINGS_TIME_ANIMATE_DESC")}</p>
                            { this.renderToggle("adjustmentTimeAnimate") }
                        </div>
                        <div className="pageSection" data-active={this.isSection("time")}>
                            <label>{T.t("SETTINGS_TIME_TRANSITON_TITLE")}</label>
                            <p>{T.t("SETTINGS_TIME_TRANSITON_DESC")}</p>                            
                            <select value={window.settings.adjustmentTimeSpeed} onChange={(e) => this.setSetting("adjustmentTimeSpeed", e.target.value)}>
                                <option value="slowest">{T.t("GENERIC_SPEED_VERY_SLOW")}</option>
                                <option value="slow">{T.t("GENERIC_SPEED_SLOW")}</option>
                                <option value="normal">{T.t("GENERIC_SPEED_NORMAL")}</option>
                                <option value="faster">{T.t("GENERIC_SPEED_FAST")}</option>
                                <option value="fastest">{T.t("GENERIC_SPEED_VERY_FAST")}</option>
                                <option value="instant">{T.t("GENERIC_SPEED_INSTANT")}</option>
                            </select>
                        </div>
                        <div className="pageSection" data-active={this.isSection("time")}>
                            <label>{T.t("SETTINGS_TIME_STARTUP_TITLE")}</label>
                            <p>{T.t("SETTINGS_TIME_STARTUP_DESC")}</p>
                            { this.renderToggle("checkTimeAtStartup") }
                        </div>
                        <div className="pageSection" data-active={this.isSection("time")}>
                            <div className="sectionTitle">{T.t("SETTINGS_TIME_IDLE_TITLE")}</div>
                            <label>{T.t("SETTINGS_TIME_IDLE_TITLE")}</label>
                            <p>{T.t("SETTINGS_TIME_IDLE_DESC")}</p>                            
                            { this.renderToggle("detectIdleTimeEnabled") }
                            <div style={{"display":(window.settings?.detectIdleTimeEnabled === true ? "flex" : "none")}}>
                                <div style={{"marginRight":"6px"}}>
                                    <label style={{"textTransform":"capitalize"}}>{T.t("GENERIC_MINUTES")}</label>
                                    <input type="number" min="0" max="600" value={window.settings.detectIdleTimeMinutes * 1} onChange={(e) => this.setSetting("detectIdleTimeMinutes", e.target.value)} />
                                </div>
                                <div>
                                    <label style={{"textTransform":"capitalize"}}>{T.t("GENERIC_SECONDS")}</label>
                                    <input type="number" min="0" max="600" value={window.settings.detectIdleTimeSeconds * 1} onChange={(e) => this.setSetting("detectIdleTimeSeconds", e.target.value)} />
                                </div>
                            </div>
                        </div>




                        <div className="pageSection" data-active={this.isSection("monitors")}>
                            <div className="sectionTitle">{T.t("GENERIC_ALL_DISPLAYS")}</div>
                            <div className="monitorItem">
                                {this.getInfoMonitors()}
                            </div>
                        </div>
                        <div className="pageSection" data-active={this.isSection("monitors")}>
                            <div className="sectionTitle">{T.t("SETTINGS_MONITORS_RATE_TITLE")}</div>
                            <p>{T.t("SETTINGS_MONITORS_RATE_DESC")}</p>
                            <select value={this.state.updateInterval} onChange={this.updateIntervalChanged}>
                                <option value="100">{T.t("SETTINGS_MONITORS_RATE_0")}</option>
                                <option value="250">{T.t("SETTINGS_MONITORS_RATE_1")}</option>
                                <option value="500">{T.t("SETTINGS_MONITORS_RATE_2")}</option>
                                <option value="1000">{T.t("SETTINGS_MONITORS_RATE_3")}</option>
                                <option value="2000">{T.t("SETTINGS_MONITORS_RATE_4")}</option>
                            </select>
                        </div>
                        <div className="pageSection" data-active={this.isSection("monitors")}>
                            <div className="sectionTitle">{T.t("SETTINGS_MONITORS_HIDE_INTERNAL_TITLE")}</div>
                            <p>{T.t("SETTINGS_MONITORS_HIDE_INTERNAL_DESC")}</p>
                            { this.renderToggle("hideClosedLid") }
                        </div>
                        <div className="pageSection" data-active={this.isSection("monitors")}>
                            <div className="sectionTitle">{T.t("SETTINGS_MONITORS_HIDE_DISPLAYS_TITLE")}</div>
                            <p>{T.t("SETTINGS_MONITORS_HIDE_DISPLAYS_DESC")}</p>
                            { this.getHideMonitors() }
                        </div>
                        <div className="pageSection" data-active={this.isSection("monitors")}>
                            <div className="sectionTitle">{T.t("SETTINGS_MONITORS_RENAME_TITLE")}</div>
                            <p>{T.t("SETTINGS_MONITORS_RENAME_DESC")}</p>
                            {this.getRenameMonitors()}
                        </div>
                        <div className="pageSection" data-active={this.isSection("monitors")}>
                            <div className="sectionTitle">{T.t("SETTINGS_MONITORS_REORDER_TITLE")}</div>
                            <p>{T.t("SETTINGS_MONITORS_REORDER_DESC")}</p>
                            <div className="reorderList">
                                {this.getReorderMonitors()}
                            </div>
                        </div>
                        <div className="pageSection" data-active={this.isSection("monitors")}>
                            <div className="sectionTitle">{T.t("SETTINGS_MONITORS_NORMALIZE_TITLE")}</div>
                            <p>{T.t("SETTINGS_MONITORS_NORMALIZE_DESC")}</p>
                            <div className="monitorItem">
                                {this.getMinMaxMonitors()}
                            </div>
                        </div>




                        <div className="pageSection" data-active={this.isSection("features")}>
                            <div className="sectionTitle">{T.t("SETTINGS_SIDEBAR_FEATURES")}</div>
                            <p>{T.t("SETTINGS_FEATURES_DESCRIPTION")}</p>
                            {this.getFeaturesMonitors()}
                            <div className="ddc-warning">⚠️ <em>{T.t("GENERIC_DDC_WARNING")}</em></div>
                        </div>
                        <div className="pageSection" data-active={this.isSection("features")}>
                        <div className="sectionTitle">{T.t("SETTINGS_FEATURES_CUR_BRIGHTNESS_TITLE")}</div>
                            <p>{T.t("SETTINGS_FEATURES_CUR_BRIGHTNESS_DESC")}</p>
                            { this.renderToggle("getDDCBrightnessUpdates") }
                        </div>





                        <div className="pageSection" data-active={this.isSection("hotkeys")}>
                            <div className="sectionTitle">{T.t("SETTINGS_HOTKEYS_TITLE")}</div>
                            <p>{T.t("SETTINGS_HOTKEYS_DESC")}</p>
                            <div className="hotkey-monitors">
                                {this.getHotkeyMonitor(T.t("GENERIC_ALL_DISPLAYS"), "all")}
                                {this.getHotkeyMonitors()}
                            </div>

                        </div>
                        <div className="pageSection" data-active={this.isSection("hotkeys")}>
                            <label>{T.t("SETTINGS_HOTKEYS_LEVEL_TITLE")}</label>
                            <p>{T.t("SETTINGS_HOTKEYS_LEVEL_DESC")}</p>
                            <Slider type="min" min={1} max={100} level={this.state.hotkeyPercent || 1} onChange={(e) => { this.setState({ hotkeyPercent: e * 1 }); window.sendSettings({ hotkeyPercent: e * 1 }) }} scrolling={false} />
                        </div>

                        <div className="pageSection" data-active={this.isSection("hotkeys")}>
                            <label>{T.t("SETTINGS_HOTKEYS_BREAK_TITLE")}</label>
                            <p>{T.t("SETTINGS_HOTKEYS_BREAK_DESC")}</p>
                            { this.renderToggle("hotkeysBreakLinkedLevels") }
                        </div>

                        <div className="pageSection" data-active={this.isSection("hotkeys")}>
                            <div className="sectionTitle">{T.t("SETTINGS_GENERAL_SCROLL_TITLE")}</div>
                            <p>{T.t("SETTINGS_GENERAL_SCROLL_DESC")}</p>
                            { this.renderToggle("scrollShortcut") }
                        </div>

                        <div className="pageSection" data-active={this.isSection("hotkeys")}>
                            <div className="sectionTitle">{T.t("SETTINGS_HOTKEYS_TOD_TITLE")}</div>
                            <p>{T.t("SETTINGS_HOTKEYS_TOD_DESC")}</p>
                            <select value={this.state.rawSettings.sleepAction} onChange={this.sleepActionChanged}>
                                <option value="none">{T.t("SETTINGS_HOTKEYS_TOD_NONE")}</option>
                                <option value="ps">{T.t("SETTINGS_HOTKEYS_TOD_SOFT")}</option>
                                <option value="ddcci">{T.t("SETTINGS_HOTKEYS_TOD_HARD")}</option>
                                <option value="ps_ddcci">{T.t("SETTINGS_HOTKEYS_TOD_BOTH")}</option>
                            </select>
                            <p><i>{T.t("SETTINGS_HOTKEYS_TOD_NOTE")}</i></p>
                            {
                                (this.state.rawSettings?.sleepAction === "ddcci" || this.state.rawSettings?.sleepAction === "ps_ddcci" ? (<div className="ddc-warning">⚠️ <em>{T.t("GENERIC_DDC_WARNING")}</em></div>) : null)
                            }
                        </div>

                        <div className="pageSection" data-active={this.isSection("hotkeys")}>
                            <div className="sectionTitle">App Profiles</div>
                            <p>Automatically adjust the brightness or shortcut overlay behavior depending on the focused app.</p>
                            <div className="hotkey-profiles">
                                { this.state.rawSettings?.profiles?.map( profile => <AppProfile profile={profile} monitors={this.state.monitors} updateValue={(key, value) => {
                                    profile[key] = value
                                    sendSettingsImmediate({ profiles: this.state.rawSettings?.profiles })
                                    this.forceUpdate()
                                }} />) }
                                <hr />
                                <div className="add-new button" onClick={() => addNewProfile(this.state)}>+ New Profile</div>
                            </div>

                        </div>


                        <div className="pageSection" data-active={this.isSection("updates")}>
                            <div className="sectionTitle">{T.t("SETTINGS_UPDATES_TITLE")}</div>
                            <p>{T.h("SETTINGS_UPDATES_VERSION", '<b>' + (window.version || "not available") + '</b>')}</p>
                            {this.getUpdate()}
                        </div>
                        <div className="pageSection" data-active={this.isSection("updates")} style={{ display: (window.isAppX ? "none" : (this.isSection("updates") ? "block" : "none")) }}>
                            <label>{T.t("SETTINGS_UPDATES_AUTOMATIC_TITLE")}</label>
                            <p>{T.t("SETTINGS_UPDATES_AUTOMATIC_DESC")}</p>
                            { this.renderToggle("checkForUpdates") }
                        </div>


                        <div className="pageSection" data-active={this.isSection("updates")} style={{ display: (window.isAppX ? "none" : (this.isSection("updates") ? "block" : "none")) }}>
                            <label>{T.t("SETTINGS_UPDATES_CHANNEL")}</label>
                            <select value={this.state.rawSettings.branch} onChange={(e) => { window.sendSettings({ branch: e.target.value }) }}>
                                <option value="master">{T.t("SETTINGS_UPDATES_BRANCH_STABLE")}</option>
                                <option value="beta">{T.t("SETTINGS_UPDATES_BRANCH_BETA")}</option>
                            </select>
                        </div>

                        <div className="pageSection debug" data-active={this.isSection("debug")}>
                            <div className="sectionTitle">All Displays</div>
                            <label>Every detected display (including those not compatible) is listed below.</label>
                            <br />
                            <p>
                                <a className="button" onClick={() => { window.requestMonitors(true) }}>Refresh Monitors</a>
                                <a className="button" onClick={() => { window.ipc.send("apply-last-known-monitors") }}>Apply Last Known Brightness</a>
                            </p>
                            {this.getDebugMonitors()}
                        </div>

                        <div className="pageSection debug" data-active={this.isSection("debug")}>
                            <div className="sectionTitle">Settings</div>
                            <label>These are your raw user settings.</label>
                            <p style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(this.state.rawSettings, undefined, 2)}</p>
                        </div>

                        <div className="pageSection debug" data-active={this.isSection("debug")}>
                            <div className="sectionTitle">Other</div>
                            <br />
                            <p>Dev Mode</p>
                            { this.renderToggle("isDev") }
                            <br />
                            <label>Disable Auto Apply</label>
                            <p>Prevent last known brightness from re-applying after certain hardware/user events.</p>
                            { this.renderToggle("disableAutoApply") }
                            <br />
                            <label>Disable Auto Refresh</label>
                            <p>Prevent last known brightness from read after certain hardware/user events.</p>
                            { this.renderToggle("disableAutoRefresh") }
                            <br />
                            <p>Use Native Animation (depricated)</p>
                            { this.renderToggle("useNativeAnimation") }
                            <br />
                            <p>Use Taskbar Registry</p>
                            { this.renderToggle("useTaskbarRegistry") }
                            <br />
                            <p>Disable WMIC (requires restart)</p>
                            { this.renderToggle("disableWMIC") }
                            <br />
                            <p>Disable WMI (requires restart)</p>
                            { this.renderToggle("disableWMI") }
                            <br />
                            <p>Disable Win32 (requires restart)</p>
                            { this.renderToggle("disableWin32") }
                            <br />
                            <p>Disable Mouse Events (requires restart)</p>
                            { this.renderToggle("disableMouseEvents") }

                            <div className="sectionTitle">Raw Monitor Data</div>
                            <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(window.allMonitors, undefined, 2)}</pre>

                        </div>

                    </div>
                </div>
            </div>

        );
    }
}

function addNewProfile(state) {
    if(!state.rawSettings?.profiles) return false;
    const id = uuid()
    const profile = {
        id,
        name: "",
        overlayType: "normal",
        setBrightness: false,
        monitors: {},
        showInMenu: false
    }
    state.rawSettings.profiles.push(profile)
    sendSettings({ profiles: state.rawSettings.profiles})
}

function getProfileMonitors(monitors, profile, onChange) {
    return Object.values(monitors).map((monitor, idx) => {
        if (monitor.type == "none") {
            return (<div key={monitor.id + ".brightness"}></div>)
        } else {
            let level = (profile.monitors?.[monitor.id] ?? 50)
            return (<Slider key={monitor.id + ".brightness"} min={0} max={100} name={monitor.name} onChange={level => {
                profile.monitors[monitor.id] = level
                onChange(profile, monitor.id, level)
            }} level={level} scrolling={false} />)
        }
    })
}

function AppProfile(props) {
    const { profile, updateValue, onDelete, monitors } = props
    if(!profile.monitors) profile.monitors = {};
  
    return (
      <div className="appProfileItem" key={profile.id}>
        <hr />
        <label>Profile name</label>
        <input type="text" placeholder="Profile Name" value={profile.name} onChange={e => updateValue("name", e.target.value)}></input>
        <label>App path (optional)</label>
        <p>If you want this profile to activate automatically when a specific app is focused, enter the full or partial path of the EXE here.</p>
        <input type="text" placeholder="App Path" value={profile.path} onChange={e => updateValue("path", e.target.value)}></input>
        <label>Overlay type <sup className="info-circle" title="Disabled: Do not show overlay. Useful for exclusive fullscreen games.
Aggressive: Applies the overlay in a way that will display over borderless fullscreen games. This will break exlusive fullscreen games.">i</sup></label>
        <select value={profile.overlayType} onChange={e => updateValue("overlayType", e.target.value)}>
          <option value="normal">Normal</option>
          <option value="disabled">Disabled</option>
          <option value="aggressive">Aggressive</option>
        </select>

        <div className="feature-toggle-row">
            <input onChange={(e) => {updateValue("showInMenu", e.target.checked)}} checked={profile.showInMenu} data-checked={profile.showInMenu} type="checkbox" />
            <div className="feature-toggle-label"><span>Show in right-click tray menu</span></div>
        </div>

        <div className="feature-toggle-row">
            <input onChange={(e) => {updateValue("setBrightness", e.target.checked)}} checked={profile.setBrightness} data-checked={profile.setBrightness} type="checkbox" />
            <div className="feature-toggle-label"><span>Set brightness when active</span></div>
        </div>
        { ( profile.setBrightness ? getProfileMonitors(monitors, profile, profile => updateValue("monitors", profile.monitors)) : null )}
        <br />
        <div className="add-new button block" onClick={onDelete}><div className="icon" dangerouslySetInnerHTML={{ __html: "&#xE74D;" }}></div> <span>Delete</span></div>
      </div>
    )
  }
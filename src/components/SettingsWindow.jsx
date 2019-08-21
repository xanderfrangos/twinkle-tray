import React, { PureComponent, useState } from "react";


export default class SettingsWindow extends PureComponent {
    

    constructor(props) {
        super(props)
        this.state = {
            theme: 'default',
            openAtLogin: false
        }
    }

    componentDidMount() {
        window.addEventListener("settingsUpdated", (e) => {
            this.forceUpdate()
        })
    }

    themeChanged = (event) => {
        this.setState({theme: event.target.value})
        window.sendSettings({ theme: event.target.value })
    }

    startupChanged = (event) => {
        const openAtLogin = (this.state.openAtLogin ? false : true)
        console.log(openAtLogin)
        this.setState({ openAtLogin })
        window.sendSettings({ openAtLogin })
    }
   

    render() {
        return (
            <div className="window-base" data-theme={window.settings.theme || "default"}>
                <input onChange={this.startupChanged} checked={window.settings.openAtLogin || false} type="checkbox" /><label>Launch at startup</label>
                <div><label>App Theme</label></div>
                <select value={this.state.theme} onChange={this.themeChanged}>
                    <option value="default">System Preference (Default)</option>
                    <option value="dark">Dark Mode</option>
                    <option value="light">Light Mode</option>
                    </select>
                <input type="text" />
            </div>

        );
    }
}

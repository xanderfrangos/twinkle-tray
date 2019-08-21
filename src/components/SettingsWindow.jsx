import React, { PureComponent, useState } from "react";
import Titlebar from './Titlebar'


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
        fetch("https://api.github.com/repos/xanderfrangos/twinkle-tray/releases").then((response) => { response.json().then( (json) => {
            this.setState({
                releaseURL: json[0].html_url,
                latest: json[0].tag_name
            })
        })});
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

    getUpdate = () => {
        if(this.state.latest && this.state.latest != window.version) {
            return (
                <div>
                    <p><b style={{color: window.accent}}>An update is available for Twinkle Tray!</b></p><p>Click below to download <b>{this.state.latest || "not available"}</b>.</p>
                    <br />
                    <a className="button" onClick={() => { window.openURL(this.state.releaseURL) }}>Get latest version</a>
                </div>
            )
        } else {
            return (
                <p>There are no updates available at this time.</p>
            )
        }
    }
   

    render() {
        return (
            <div className="window-base" data-theme={window.settings.theme || "default"}>
                <Titlebar title="Twinkle Tray Settings" />
                <div className="pageSection">
                    <div className="sectionTitle">General</div>
                    <label>Launch at startup</label>
                    <input onChange={this.startupChanged} checked={window.settings.openAtLogin || false} data-checked={window.settings.openAtLogin || false} type="checkbox" id="theme" />
                    <label>App Theme</label>
                    <select value={this.state.theme} onChange={this.themeChanged}>
                        <option value="default">System Preference (Default)</option>
                        <option value="dark">Dark Mode</option>
                        <option value="light">Light Mode</option>
                    </select>
                </div>
                <div className="pageSection" style={{display:'none'}}>
                    <div className="sectionTitle">Monitors</div>
                    <p>Give monitors different names, or remap the min/max brightness so that the levels across all monitors are normalized.</p>
                    <div>
                        <label>Rename</label>
                        <input type="text" />
                    </div>
                </div>
                <div className="pageSection">
                    <div className="sectionTitle">Updates</div>
                    <p>Your version of Twinkle Tray is <b>{window.version || "not available"}</b>.</p>
                    { this.getUpdate() }
                </div>
            </div>

        );
    }
}

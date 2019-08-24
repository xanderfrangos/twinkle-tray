import React, { PureComponent, useState } from "react";
import Titlebar from './Titlebar'
import Monitor from './SettingsMonitor'
import Slider from "./Slider";


export default class SettingsWindow extends PureComponent {
    

    constructor(props) {
        super(props)
        this.state = {
            theme: 'default',
            openAtLogin: false,
            monitors: [],
            remaps: {},
            linkedLevelsActive: false,
            updateInterval: 500
        }
        this.lastLevels = []
    }

    componentDidMount() {
        window.addEventListener("monitorsUpdated", this.recievedMonitors)
        window.addEventListener("namesUpdated", this.recievedNames)
        window.addEventListener("settingsUpdated", this.recievedSettings)

        fetch("https://api.github.com/repos/xanderfrangos/twinkle-tray/releases").then((response) => { response.json().then( (json) => {
            this.setState({
                releaseURL: json[0].html_url,
                latest: json[0].tag_name
            })
        })});
    }

    getRemap = (name) => {
        if(this.state.remaps[name] === undefined) {
            return {
                min: 0,
                max: 100
            }
        }
        return this.state.remaps[name]
    }


    minMaxChanged = (value, slider) => {

        const name = slider.props.monitorName
        const remaps = Object.assign(this.state.remaps, {})

        if(remaps[name] === undefined) {
            remaps[name] = {
                min: 0,
                max: 100
            }
        }

        if(slider.props.type == "min") {
            remaps[name].min = value


            // Keep within 10%, cap

            if(remaps[name].min > remaps[name].max - 10) {
                remaps[name].max = remaps[name].min + 10
            } 

            if(remaps[name].max > 100) {
                remaps[name].max = 100
            }

            if(remaps[name].min > remaps[name].max - 10) {
                remaps[name].min = remaps[name].max - 10
            } 

        } else if(slider.props.type == "max") {
            remaps[name].max = value

            // Keep within 10%, cap

            if(remaps[name].min > remaps[name].max - 10) {
                remaps[name].min = remaps[name].max - 10
            } 

            if(remaps[name].min < 0) {
                remaps[name].min = 0
            }

            if(remaps[name].min > remaps[name].max - 10) {
                remaps[name].max = remaps[name].min + 10
            }

        }


        this.setState({
            remaps
        })

        this.forceUpdate()
        window.sendSettings({ remaps: remaps })
        window.requestSettings()
    }

    themeChanged = (event) => {
        this.setState({ theme: event.target.value })
        window.sendSettings({ theme: event.target.value })
    }

    updateIntervalChanged = (event) => {
        this.setState({ updateInterval: event.target.value * 1 })
        window.sendSettings({ updateInterval: event.target.value * 1 })
    }

    startupChanged = (event) => {
        const openAtLogin = (this.state.openAtLogin ? false : true)
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

      getMinMaxMonitors = () => {
        if(this.state.monitors == undefined || this.state.monitors.length == 0) {
            return (<div className="no-displays-message">No displays found.<br /><br /></div>)
          } else {
            return this.state.monitors.map((monitor, index) => {
                const remap = this.getRemap(monitor.name)
                return (
                    <div key={monitor.name}>
                        <br />
                        <div className="sectionSubtitle"><div className="icon">&#xE7F4;</div><div>{ monitor.name }</div></div>
                        <label>Min</label>
                        <Slider key={monitor.name + ".min"} type="min" level={remap.min} monitorName={ monitor.name } onChange={this.minMaxChanged} scrolling={ false } />
                        <label>Max</label>
                        <Slider key={monitor.name + ".max"} type="max" level={remap.max} monitorName={ monitor.name } onChange={this.minMaxChanged} scrolling={ false } />
                    </div>
                  
                )
            } )
          }
      }

      getRenameMonitors = () => {
        if(this.state.monitors == undefined || this.state.monitors.length == 0) {
            return (<div className="no-displays-message">No displays found.<br /><br /></div>)
          } else {
            return this.state.monitors.map((monitor, index) => (
                <div key={index}>
                    <br />
                    <div className="sectionSubtitle"><div className="icon">&#xE7F4;</div><div>{ monitor.name }</div></div>
                    <input type="text" placeholder="Enter name"></input>
                </div>
              
            ))
          }
      }







// Update monitor info
recievedMonitors = (e) => {
    if(this.state.monitors.length > 0 || e.detail.length > 0) {
  
      let idx = 0
      let newMonitors = Object.assign(e.detail, {})
  
      this.lastLevels.length = e.detail.length
  
      for(let monitor of this.state.monitors) {
        newMonitors[idx] = Object.assign(newMonitors[idx], { name: monitor.name, min: monitor.min, max: monitor.max })
        idx++
      }
  
      this.setState({
        monitors: newMonitors
      })
    }
    
    this.forceUpdate()
  }
  
  // Update monitor names
  recievedNames = (e) => {
    if(this.state.monitors.length > 0) {
  
      let idx = 0
      let newMonitors = Object.assign(this.state.monitors, {})
      
      for(let monitor of e.detail) {
        newMonitors[idx] = Object.assign(newMonitors[idx], { name: monitor.name })
  
        for(let remap in this.state.remaps) {
          if(monitor.name == remap) {
            newMonitors[idx].min = this.state.remaps[remap].min
            newMonitors[idx].max = this.state.remaps[remap].max
          }
        }
  
        idx++
      }
  
      this.setState({
        monitors: newMonitors
      })
    }
    
    this.forceUpdate()
  }

  // Update settings
recievedSettings = (e) => {
    const settings = e.detail
    const linkedLevelsActive = (settings.linkedLevelsActive || false)
    const updateInterval = (settings.updateInterval || 500) * 1
    const remaps = (settings.remaps || {})
    this.setState({
      linkedLevelsActive,
      remaps,
      updateInterval
    }, () => {
      this.forceUpdate()
    })
  }




   

    render() {
        return (
            <div className="window-base" data-theme={window.settings.theme || "default"}>
                <Titlebar title="Twinkle Tray Settings" />
                <div id="page">
                    <div className="pageSection">
                        <div className="sectionTitle">General</div>
                        <label>Launch at startup</label>
                        <input onChange={this.startupChanged} checked={window.settings.openAtLogin || false} data-checked={window.settings.openAtLogin || false} type="checkbox" id="theme" />
                        <label>App Theme</label>
                        <select value={window.settings.theme} onChange={this.themeChanged}>
                            <option value="default">System Preference (Default)</option>
                            <option value="dark">Dark Mode</option>
                            <option value="light">Light Mode</option>
                        </select>
                        <label>Brightness update rate</label>
                        <p>How often the brightness will be updated on your displays as you're adjusting their values. Increase the time if your displays are flickering.</p>
                        <select value={window.settings.updateInterval} onChange={this.updateIntervalChanged}>
                            <option value="250">Fast (0.25 seconds)</option>
                            <option value="500">Normal (0.5 seconds)</option>
                            <option value="1000">Slow (1 second)</option>
                            <option value="2000">Very Slow (2 seconds)</option>
                        </select>
                    </div>
                    <div className="pageSection">
                        <div className="sectionTitle">Normalize Brightness</div>
                        <p>Monitors often have different brightness ranges. By limiting the minimum/maximum brightness per display, the brightness levels between displays is much more consistent.</p>
                        <div style={{ maxWidth: "320px" }}>
                            { this.getMinMaxMonitors() }
                        </div> 
                    </div>
                    <div className="pageSection" style={{display:'none'}}>
                        <div className="sectionTitle">Rename Monitors</div>
                        <p>If you'd prefer a different name for each monitor (ex "Left Monitor", "Middle Monitor"), you can enter it below. Leaving the field empty will restore the original name.</p>
                        
                        { this.getRenameMonitors() }

                    </div>
                    <div className="pageSection">
                        <div className="sectionTitle">Updates</div>
                        <p>Your version of Twinkle Tray is <b>{window.version || "not available"}</b>.</p>
                        { this.getUpdate() }
                    </div>
                </div>
            </div>

        );
    }
}

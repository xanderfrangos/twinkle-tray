import React, { PureComponent } from "react";
import Slider from "./Slider";

const monitorSort = (a, b) => {
  const aSort = (a.order === undefined ? 999 : a.order * 1)
  const bSort = (b.order === undefined ? 999 : b.order * 1)
  return aSort - bSort
}

export default class BrightnessPanel extends PureComponent {

  // Render <Slider> components
  getMonitors = () => {
    if(this.state.monitors.length == 0) {
      return (<div className="no-displays-message">No compatible displays found. Please check that "DDC/CI" is enabled for your monitors.</div>)
    } else {
      const sorted = this.state.monitors.slice(0).sort(monitorSort)
      return sorted.map((monitor, index) => (
        <Slider name={ this.getMonitorName(monitor, this.state.names) } level={ monitor.brightness } min={ monitor.min } max={ monitor.max } num={ index } monitortype={monitor.type} key={ index } onChange={ this.handleChange } />
      ))
    }
  }

  // Render link icon, if available
  getLinkIcon = () => {
    if(this.state.monitors.length > 1) {
      return (
      <div title="Link levels" data-active={this.state.linkedLevelsActive} onClick={this.toggleLinkedLevels} className="link">&#xE71B;</div>
      )
    }
  }

  getMonitorName = (monitor, renames) => {
    if(Object.keys(renames).indexOf(monitor.id) >= 0 && renames[monitor.id] != "") {
      return renames[monitor.id]
  } else {
      return monitor.name
  }
}


  // Enable/Disable linked levels
  toggleLinkedLevels = () => {
    const linkedLevelsActive = (this.state.linkedLevelsActive ? false : true)
    this.setState({
      linkedLevelsActive
    })
    window.sendSettings({
      linkedLevelsActive
    })
  }

  // Handle <Slider> changes
  handleChange = (level, slider) => {
    const monitors = Object.assign(this.state.monitors, {})
    const activeMon = monitors[slider.props.num]
    
    if(monitors.length > 0 && this.state.linkedLevelsActive) {
      // Update all monitors (linked)
      for(let monitor of monitors) {
        monitor.brightness = level
        if(slider.props.num != monitor.num) {
          monitor.brightness = this.normalize(this.normalize(level, false, activeMon.min, activeMon.max), true, monitor.min, monitor.max)
        } else {

        }
      }
      this.setState({
        monitors
      }, () => {
        this.levelsChanged = true
        if(this.state.updateInterval === 999) this.syncBrightness()
      })
    } else if(monitors.length > 0) {
      // Update single monitor
      monitors[slider.props.num].brightness = level
      this.setState({
        monitors
      }, () => {
        this.levelsChanged = true
        if(this.state.updateInterval === 999) this.syncBrightness()
      })
    }
    
    this.forceUpdate()
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


updateMinMax = () => {
  if(this.state.monitors.length > 0) {

    let newMonitors = Object.assign(this.state.monitors, {})
    
    for(let monitor of newMonitors) {
      for(let remap in this.state.remaps) {
        if(monitor.name == remap) {
          monitor.min = this.state.remaps[remap].min
          monitor.max = this.state.remaps[remap].max
        }
      }
    }

    this.levelsChanged = true

    this.setState({
      monitors: newMonitors
    }, () => {
      this.doBackgroundEvent = true
    })
  }
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
    }, () => {
      this.doBackgroundEvent = true
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
  const names = (settings.names || {})
  this.levelsChanged = true
  this.setState({
    linkedLevelsActive,
    remaps,
    names,
    updateInterval
  }, () => {
    this.resetBrightnessInterval()
    this.updateMinMax()
    this.forceUpdate()
    this.doBackgroundEvent = true
  })
}



normalize(level, sending = false, min = 0, max = 100) {
  if(min > 0 || max < 100) {
    let out = level
    if(sending) {
      out = (min + ( ( level / 100) * (max - min) ) )
    } else {
      out = ((level - min) * (100 / (max - min)))
    }
    return Math.round(out)
  } else {
    return level
  } 
}


resetBrightnessInterval = () => {
  if(this.updateInterval) clearInterval(this.updateInterval)
  this.updateInterval = setInterval( this.syncBrightness, (this.state.updateInterval || 500))
}



// Send new brightness to monitors, if changed
syncBrightness = () => {
  const monitors = this.state.monitors
  if (this.levelsChanged && (window.showPanel || this.doBackgroundEvent) && monitors.length) {
    this.doBackgroundEvent = false
    this.levelsChanged = false

    try {
      for(let idx = 0; idx < monitors.length; idx++) {
        if(monitors[idx].brightness != this.lastLevels[idx]) {
          window.updateBrightness(idx, monitors[idx].brightness)
        }
      }
    } catch (e) {
      console.error("Could not update brightness")
    }        
  }
}


  constructor(props) {
    super(props);
    this.state = {
      monitors: [],
      linkedLevelsActive: false,
      names: {}
    }
    this.lastLevels = []
    this.updateInterval = null
    this.doBackgroundEvent = false
    this.levelsChanged = false
}

  componentDidMount() {

    window.addEventListener("monitorsUpdated", this.recievedMonitors)
    window.addEventListener("namesUpdated", this.recievedNames)
    window.addEventListener("settingsUpdated", this.recievedSettings)

    // Update brightness every interval, if changed
    this.resetBrightnessInterval()

  }

  componentDidUpdate() {
    window.sendHeight(window.document.getElementById("panel").offsetHeight)
  }

  render() {
    return (
      <div className="window-base" data-theme={window.settings.theme || "default"} id="panel">
        <div className="titlebar">
        <div className="title">Adjust Brightness</div>
        <div className="icons">
          { this.getLinkIcon() }
          <div title="Turn off displays" className="off" onClick={window.turnOffDisplays}>&#xEC46;</div>
          <div title="Settings" className="settings" onClick={window.openSettings}>&#xE713;</div>
        </div>
      </div>
        { this.getMonitors() }
      </div>
    );
  }


}

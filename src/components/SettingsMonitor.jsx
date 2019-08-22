import React from "react";

export default class Monitor extends React.Component {

  handleChange = (event) => {
    const level = event.target.value
    this.setState({ level });
    //this.sendLinkedLevel(level)
  }

  handleWheel = (event) => {
    const level = (this.state.level * 1) + Math.round(event.deltaY * -1 * 0.01)
    this.setState({ level })
    //this.sendLinkedLevel(level)
  }

  constructor(props) {
    super(props);
    this.state = {
      level: this.adjust(this.props.level),
      lastLevel: this.adjust(this.props.level),
      name: this.props.name
    }
  }

  adjust(level, sending = false) {
    const min = window.allMonitors[this.props.monitorNum].min || 0
    const max = window.allMonitors[this.props.monitorNum].max || 100

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

  sendLinkedLevel = (level) => {
    if(window.linkedLevelsActive == true) {
      window.dispatchEvent(new CustomEvent('linkedLevelsUpdated', {
        detail: {
          from: this.props.monitorNum,
          level
        }
      }))
    }
  }

  recievedBrightness = () => {
    if (window.allMonitors.length > 0) {
      const adjusted = this.adjust(window.allMonitors[this.props.monitorNum].brightness)
      this.setState({ level: adjusted, lastLevel: adjusted })
    }
  }

  recievedName = () => {
    if (window.allMonitors.length > 0) {
      this.setState({ name: window.allMonitors[this.props.monitorNum].name })
    }
  }

  linkedLevelsUpdated = (e) => {
    console.log("recieved linkedLevelsUpdated")
    if(e.detail.from != this.props.monitorNum) {
      if (window.allMonitors.length > 0) {
        const adjusted = this.adjust(e.detail.level)
        this.setState({ level: adjusted })
      }
    }
  }

  componentDidMount() {

    window.addEventListener('monitorsUpdated', this.recievedBrightness)
    window.addEventListener('namesUpdated', this.recievedName)
    window.addEventListener('linkedLevelsUpdated', this.linkedLevelsUpdated)

    setInterval(() => {
      // Update brightness every 0.25s, if changed
      if (window.showPanel && this.state.level != this.state.lastLevel) {
        this.setState({
          lastLevel: this.state.level
        })
        //window.updateBrightness(this.props.monitorNum, this.adjust(this.state.level, true) );
      }
    }, 250)

  }

  render() {

    return (
      <div className="monitor-item">
        <div className="name-row">
          <div className="icon">&#xE7F4;</div>
          <div className="title">{this.state.name}</div>
        </div>
        <div className="input--range">
          <div className="rangeGroup">
            <input type="range" min="0" max="100" value={this.state.level} data-percent={this.state.level + "%"} onChange={this.handleChange} onWheel={this.handleWheel} className="range" />
            <div className="progress" style={{transform: "scaleX(" + (this.state.level * 0.01) + ")"}}></div>
          </div>
          <input type="number" min="0" max="100" value={this.state.level} onChange={this.handleChange} onWheel={this.handleWheel} className="val" />
        </div>
      </div>
    );
  }
};

import React from "react";


export default class Monitor extends React.Component {

  handleChange = (event) => {
    this.setState({ level: event.target.value });
  }

  handleWheel = (event) => {
    const newVal = (this.state.level * 1) + Math.round(event.deltaY * -1 * 0.01)
    this.setState({
      level: newVal
    })
  }

  constructor(props) {
    super(props);
    this.state = {
      level: this.props.level,
      lastLevel: this.props.level,
      name: this.props.name
    }
  }

  componentDidMount() {
    window.addEventListener('monitorsUpdated', (args) => {
      if (window.allMonitors.length > 0) {
        this.setState({ level: window.allMonitors[this.props.monitorNum].brightness })
      }
    })
    window.addEventListener('namesUpdated', (args) => {
      if (window.allMonitors.length > 0) {
        this.setState({ name: window.allMonitors[this.props.monitorNum].name })
      }
    })

    setInterval(() => {
      // Update brightness every 0.25s, if changed
      if (this.state.level != this.state.lastLevel) {
        this.setState({
          lastLevel: this.state.level
        })
        window.updateBrightness(this.props.monitorNum, this.state.level);
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
          <input type="range" min="0" max="100" value={this.state.level} onChange={this.handleChange} onWheel={this.handleWheel} className="range" />
          <input type="number" min="0" max="100" value={this.state.level} onChange={this.handleChange} onWheel={this.handleWheel} className="val" />
        </div>
      </div>
    );
  }
};

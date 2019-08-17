import React from "react";

export default class Titlebar extends React.Component {

  toggleLinkedLevels = () => {
    window.linkedLevelsActive = (window.linkedLevelsActive ? false : true)
    this.setState({
      linkedLevelsActive: window.linkedLevelsActive
    })
  }

  getLinkIcon = () => {
    if(window.allMonitors && window.allMonitors.length > 1) {
      return (
      <div title="Link levels" data-active={this.state.linkedLevelsActive} onClick={this.toggleLinkedLevels} className="link">&#xE71B;</div>
      )
    }
  }

  constructor(props) {
    super(props)
    this.state = {
      linkedLevelsActive: window.linkedLevelsActive
    }
  }




  render() {
    return (
      <div className="titlebar">
        <div className="title">Adjust Brightness</div>
        <div className="icons">
          { this.getLinkIcon() }
          <div title="Settings" className="settings" onClick={window.openSettings}>&#xE713;</div>
        </div>
      </div>
    );
  }
};


import React from "react";

export default class Titlebar extends React.Component {

  constructor(props) {
    super(props)
    this.state = {
      active: false
    }
  }

  render() {
    return (
      <div className="window-titlebar">
        <div className="titlebar-drag-region" ></div>
        <div className="window-title"><div className="appIcon" style={{ display: 'none' }}></div><div>{this.props.title || ""}</div></div>
        <div className="window-controls-container">
          <div className="window-icon-bg" onClick={() => { window.thisWindow.minimize() }}>
            <div className="window-icon window-minimize"></div>
          </div>
          <div className="window-icon-bg" onClick={() => { if(window.thisWindow.isMaximized() === false) { window.thisWindow.maximize() } else { window.thisWindow.unmaximize() } }}>
            <div className="window-icon window-max-restore window-maximize"></div>
          </div>
          <div className="window-icon-bg window-close-bg" onClick={() => { window.thisWindow.close() }}>
            <div className="window-icon window-close"></div>
          </div>
        </div>
      </div>
    );
  }
};


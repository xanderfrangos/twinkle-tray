import React from "react";

export default class Titlebar extends React.Component {
  render() {
    return (
      <div className="titlebar">
        <div className="title">Adjust Brightness</div>
        <div className="icons">
          <div title="Link Levels" className="link">&#xE71B;</div>
          <div title="Settings" className="settings">&#xE713;</div>
        </div>
      </div>
    );
  }
};


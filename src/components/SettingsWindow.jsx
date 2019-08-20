import React, { PureComponent, useState } from "react";


export default class SettingsWindow extends PureComponent {
   

    render() {
        return (
            <div className="window-base" data-theme={window.settings.theme || "default"}>
                <input type="checkbox" /><label>Launch at startup</label>
                <div><label>App Theme</label></div>
                <select onChange={(event) => {
                    window.settings.theme = event.target.value
                }}>
                    <option value="default">System Preference (Default)</option>
                    <option value="dark">Dark Mode</option>
                    <option value="light">Light Mode</option>
                    </select>
                <input type="text" />
            </div>

        );
    }
}

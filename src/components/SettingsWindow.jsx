import React, { PureComponent, useState } from "react";


export default class SettingsWindow extends PureComponent {
   

    render() {
        return (
            <div>
                <input type="checkbox" /><label>Launch at startup</label>
                <div><label>App Theme</label></div>
                <select>
                    <option>System Preference (Default)</option>
                    <option>Dark Mode</option>
                    <option>Light Mode</option>
                    </select>
                <input type="text" />
            </div>

        );
    }
}

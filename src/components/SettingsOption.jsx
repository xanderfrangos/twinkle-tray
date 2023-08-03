import React, { useState, useEffect } from "react"

export function SettingsOption(props) {
    const [expanded, setExpanded] = useState((props.startExpanded ?? false))

    const title = (props.title ? <div className="option-title">{props.title}</div> : null)
    const icon = (props.icon ? <div className="option-icon icon" dangerouslySetInnerHTML={{__html: `&#x${props.icon};` }}></div> : null)
    const description = (props.description ? <div className="option-description">{props.description}</div> : null)
    const elem = (props.content ? <div className="option-elem">{props.content}</div> : null)
    const input = (props.input ? <div className="input-area">{props.input}</div> : null)

    return (
        <div className="settings-option-elem" data-expandable={props.expandable} data-expanded={expanded}>
            <div className="parent-panel">
                { icon }
                <div className="content-area">
                    { title }
                    { description }
                    { elem }
                </div>
                { input }
                <div className="expand" onClick={() => setExpanded(!expanded)}><div className="icon">&#xE70D;</div></div>
            </div>
            <div className="settings-option-children">
                <div className="children-inner">
                    { props.children }
                </div>
            </div>
        </div>
    )
}

export function SettingsChild(props) {
    const title = (props.title ? <div className="child-option-title">{props.title}</div> : null)
    const icon = (props.icon ? <div className="option-icon icon" dangerouslySetInnerHTML={{__html: `&#x${props.icon};` }}></div> : null)
    const description = (props.description ? <div className="child-option-description">{props.description}</div> : null)
    const elem = (props.content ? <div className="option-elem">{props.content}</div> : null)
    const children = (props.children ? <div className="option-elem">{props.children}</div> : null)
    const input = (props.input ? <div className="input-area">{props.input}</div> : null)

    return (
        <div className="settings-child-elem">
            <div className="child-panel">
                { icon }
                <div className="content-area">
                    { title }
                    { description }
                    { elem }
                    { children }
                </div>
                { input }
            </div>
        </div>
    )
}
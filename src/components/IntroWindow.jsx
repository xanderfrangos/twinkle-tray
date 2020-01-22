import React, { PureComponent } from "react";
import Translate from "../Translate"
import AppLogo from "../assets/logo.png"
import IntroVideo from "../assets/intro-video.mp4"

let T = new Translate({}, {})

export default class IntroWindow extends PureComponent {

    constructor(props) {
        super(props)
    }

    componentDidMount() {
        window.addEventListener("languageUpdated", (e) => { T.setLanguageData(e.detail.desired, e.detail.default); this.forceUpdate() })
    }

    render() {
        return (
            <div className="page">
                <img src={AppLogo} />
                <div className="intro-title">{ T.t("INTRO_TITLE") }</div>
                <p>{ T.t("INTRO_INSTRUCTIONS") }</p>
                <video id="video" width="400" height="300" preload={true} loop={true}><source src={IntroVideo} type="video/mp4" /></video>
                <a className="button" onClick={window.closeIntro}>{ T.t("GENERIC_CLOSE") }</a>
            </div>
        );
    }
}

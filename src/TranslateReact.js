import Translate from "./Translate"
import React from "react";

class TranslateReact extends Translate {

    getHTML(key, ...args) {
        if(this.localizationData[key] !== undefined) {
            return (<span dangerouslySetInnerHTML={{
                __html: this.makeTranslation(this.localizationData[key], args)
            }}></span>) 
        } else if(this.fallbackData[key] !== undefined) {
            return (<span dangerouslySetInnerHTML={{
                __html: this.makeTranslation(this.fallbackData[key], args)
            }}></span>) 
        } else {
            return key
        }
    }

}

module.exports = TranslateReact
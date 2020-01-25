import React from "react";

function makeTranslation(string, args = []) {
    let outString = string
    for(let i = 1; i <= args.length; i++) {
        outString = outString.replace(`{{${i}}}`, args[i - 1])
    }
    return outString
}

class Translate {
    constructor(localizationData = {}, fallbackData = {}) {
        this.localizationData = localizationData
        this.fallbackData = fallbackData

        // getString shorthand
        this.t = this.getString
        this.h = this.getHTML
    }

    setLocalizationData(data = {}, fallback = {}) {
        this.localizationData = data
        this.fallbackData = fallback
    }

    getString(key, ...args) {
        if(this.localizationData[key] !== undefined) {
            return makeTranslation(this.localizationData[key], args)
        } else if(this.fallbackData[key] !== undefined) {
            return makeTranslation(this.fallbackData[key], args)
        } else {
            return key
        }
    }
    getHTML(key, ...args) {
        if(this.localizationData[key] !== undefined) {
            return (<span dangerouslySetInnerHTML={{
                __html: makeTranslation(this.localizationData[key], args)
            }}></span>) 
        } else if(this.fallbackData[key] !== undefined) {
            return (<span dangerouslySetInnerHTML={{
                __html: makeTranslation(this.fallbackData[key], args)
            }}></span>) 
        } else {
            return key
        }
    }
    
}

module.exports = Translate
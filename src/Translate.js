function makeTranslation(string, args = []) {
    let outString = string
    for(let i = 1; i <= args.length; i++) {
        outString = outString.replace(`{{${i}}}`, args[i - 1])
    }
    return outString
}

class Translate {
    constructor(languageData = {}, fallbackData = {}) {
        this.languageData = languageData
        this.fallbackData = fallbackData

        // getString shorthand
        this.t = this.getString
    }

    setLanguageData(data = {}, fallback = {}) {
        this.languageData = data
        this.fallbackData = fallback
    }

    getString(key, ...args) {
        if(this.languageData[key] !== undefined) {
            return makeTranslation(this.languageData[key], args)
        } else if(this.fallbackData[key] !== undefined) {
            return makeTranslation(this.fallbackData[key], args)
        } else {
            return key
        }
    }
    
}

module.exports = Translate
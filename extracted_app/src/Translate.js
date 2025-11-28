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

    makeTranslation(string, args = []) {
        let outString = string
        for (let i = 1; i <= args.length; i++) {
            outString = outString.replace(`{{${i}}}`, args[i - 1])
        }
        return outString
    }

    getString(key, ...args) {
        if (this.localizationData[key] !== undefined && this.localizationData[key] !== "") {
            return this.makeTranslation(this.localizationData[key], args)
        } else if (this.fallbackData[key] !== undefined & this.fallbackData[key] !== "") {
            return this.makeTranslation(this.fallbackData[key], args)
        } else {
            return ""
        }
    }
    getHTML(key, ...args) {
        return this.getString(key, args)
    }

}

module.exports = Translate
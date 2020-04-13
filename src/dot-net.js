var edge = require('electron-edge-js');
var getSystemTimeFormat = edge.func(function () {/*
    using System.Globalization;
    async (param) => {
        return CultureInfo.CurrentCulture.DateTimeFormat.ShortTimePattern;
    }
*/});
module.exports = getSystemTimeFormat;
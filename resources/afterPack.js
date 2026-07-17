const fs = require("fs")
const path = require("path")

// Electron runtime files that Twinkle Tray doesn't use.
// dxcompiler.dll + dxil.dll are only loaded for WebGPU (Dawn).
const removeFiles = [
    "dxcompiler.dll",
    "dxil.dll",
    "LICENSES.chromium.html"
]

exports.default = async function(context) {
    for (const file of removeFiles) {
        const filePath = path.join(context.appOutDir, file)
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath)
                console.log(`  • afterPack removed ${file}`)
            }
        } catch (e) {
            console.log(`  • afterPack couldn't remove ${file}`, e)
        }
    }
}

const hdr = require("./index");

const displays = hdr.getDisplays();
for (const display of displays) {
    console.log(`${display.name} | path=${display.path} | hdrSupported=${display.hdrSupported} hdrEnabled=${display.hdrEnabled} hdrActive=${display.hdrActive} nits=${display.nits}`)
}

const target = Object.values(displays).find(display => display.hdrSupported)
if (!target) {
    console.log("No HDR-capable display found.")
    process.exit(0)
}

console.log(`\nEnabling HDR on ${target.name} ...`)
console.log("setAdvancedColor(path, true) =", hdr.setAdvancedColor(target.path, true))
setTimeout(() => {
    const after = hdr.getDisplays().find(d => d.path === target.path)
    console.log(`after enable: hdrEnabled=${after.hdrEnabled} hdrActive=${after.hdrActive}`)
    console.log("Disabling HDR ...")
    console.log("setAdvancedColor(path, false) =", hdr.setAdvancedColor(target.path, false))
    setTimeout(() => {
        const final = hdr.getDisplays().find(d => d.path === target.path)
        console.log(`after disable: hdrEnabled=${final.hdrEnabled} hdrActive=${final.hdrActive}`)
        process.exit(0)
    }, 4000)
}, 4000)

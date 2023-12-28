const Bundler = require('parcel-bundler')
const Path = require('path')
const fs = require("fs")

const entryFiles = Path.join(__dirname, './html/*.html')

const optionsDev = {
    outDir: './cache',
    watch: true
}

const optionsProd = {
    outDir: './build',
    publicUrl: './',
    watch: true,
    cache: false,
    sourceMaps: false,
    minify: true,
    scopeHoist: true
}

function clearDirectory(relativePath) {
    const dir = Path.join(__dirname, relativePath)
    if (fs.existsSync(dir)){
        fs.rmSync(dir, { recursive: true })
    }
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir)
    }
}

async function runParcel(mode = "dev", logLevel = null) {
    const parcelMode = mode?.toLocaleLowerCase?.()
    if(parcelMode == "dev") {
        clearDirectory('../cache')
        const bundler = new Bundler(entryFiles, Object.assign(optionsDev, { watch: true, logLevel: (logLevel ?? 3) }))
        return await bundler.serve(3000)
    }
    if(parcelMode == "live") {
        clearDirectory('../build')
        const bundler = new Bundler(entryFiles, Object.assign(optionsProd, { watch: true, logLevel: (logLevel ?? 1) }))
        return await bundler.bundle()
    }
    if(parcelMode == "build") {
        clearDirectory('../build')
        const dir = Path.join(__dirname, '../html_build')
        const bundler = new Bundler(entryFiles, Object.assign(optionsProd, { watch: false, logLevel: (logLevel ?? 3) }))
        return await bundler.bundle()
    }
}

module.exports = runParcel
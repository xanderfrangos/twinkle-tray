const { Parcel } = require('@parcel/core')
const Path = require('path')
const fs = require("fs")

const entryFiles = Path.join(__dirname, './html/*.html')

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
        const bundler = new Parcel({
            entries: entryFiles,
            defaultConfig: '@parcel/config-default',
            mode: 'development',
            defaultTargetOptions: {
                distDir: Path.join(__dirname, '../cache'),
                publicUrl: './',
                sourceMaps: true
            },
            shouldDisableCache: false,
            serveOptions: {
                port: 3000
            },
            hmrOptions: {
                port: 3000
            }
        })
        return await bundler.watch()
    }

    if(parcelMode == "live") {
        clearDirectory('../build')
        const bundler = new Parcel({
            entries: entryFiles,
            defaultConfig: '@parcel/config-default',
            mode: 'production',
            defaultTargetOptions: {
                distDir: Path.join(__dirname, '../build'),
                publicUrl: './',
                sourceMaps: false
            },
            shouldDisableCache: true,
            shouldOptimize: false
        })
        return await bundler.watch()
    }

    if(parcelMode == "build") {
        clearDirectory('../build')
        const bundler = new Parcel({
            entries: entryFiles,
            defaultConfig: '@parcel/config-default',
            mode: 'production',
            defaultTargetOptions: {
                distDir: Path.join(__dirname, '../build'),
                publicUrl: './',
                sourceMaps: false
            },
            shouldDisableCache: true,
            shouldOptimize: false
        })
        const { bundleGraph, buildTime } = await bundler.run()
        console.log(`Build completed in ${buildTime}ms with ${bundleGraph.getBundles().length} bundles`)
        return bundleGraph
    }
}

module.exports = runParcel
const { Parcel } = require("@parcel/core");
const Path = require("path");
const fs = require("fs");

const entryFiles = Path.join(__dirname, "./html/*.html");

function clearDirectory(relativePath) {
  const dir = Path.join(__dirname, relativePath);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
}

async function runParcel(mode = "dev", logLevel = null) {
  const parcelMode = mode?.toLocaleLowerCase?.();

  if (parcelMode == "dev") {
    clearDirectory("../cache");
    const bundler = new Parcel({
      entries: entryFiles,
      defaultConfig: "@parcel/config-default",
      mode: "development",
      logLevel: logLevel,
      defaultTargetOptions: {
        distDir: Path.join(__dirname, "../cache"),
        publicUrl: "./",
        sourceMaps: true,
      },
      shouldDisableCache: false,
      serveOptions: {
        port: 3000,
      },
      hmrOptions: {
        port: 3000,
      },
      additionalReporters: [
        { packageName: "@parcel/reporter-dev-server", resolveFrom: __filename },
      ],
    });
    console.log("[Parcel] Starting watch mode...");
    return await bundler.watch();
  }

  if (parcelMode == "live") {
    clearDirectory("../build");
    const bundler = new Parcel({
      entries: entryFiles,
      defaultConfig: "@parcel/config-default",
      mode: "production",
      logLevel: logLevel,
      defaultTargetOptions: {
        distDir: Path.join(__dirname, "../build"),
        publicUrl: "./",
        sourceMaps: false,
      },
      shouldDisableCache: true,
      shouldOptimize: false,
    });
    console.log("[Parcel] Starting live mode...");
    return await bundler.watch();
  }

  if (parcelMode == "build") {
    clearDirectory("../build");
    const bundler = new Parcel({
      entries: entryFiles,
      defaultConfig: "@parcel/config-default",
      mode: "production",
      logLevel: logLevel,
      defaultTargetOptions: {
        distDir: Path.join(__dirname, "../build"),
        publicUrl: "./",
        sourceMaps: false,
      },
      shouldDisableCache: true,
      shouldOptimize: false,
    });
    console.log("[Parcel] Starting build...");
    const { bundleGraph, buildTime } = await bundler.run();
    console.log(
      `[Parcel] Build completed in ${buildTime}ms with ${bundleGraph.getBundles().length} bundles`,
    );
    return bundleGraph;
  }
}

module.exports = runParcel;

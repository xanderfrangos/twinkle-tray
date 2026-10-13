param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $BuilderArguments
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$builderCache = Join-Path $projectRoot ".cache\electron-builder"
$electronCache = Join-Path $projectRoot ".cache\electron"
$winCodeSignVersion = "2.6.0"
$winCodeSignArchive = Join-Path $builderCache "winCodeSign-$winCodeSignVersion.7z"
$winCodeSignDirectory = Join-Path $builderCache "winCodeSign\winCodeSign-$winCodeSignVersion"
$winCodeSignMarker = Join-Path $winCodeSignDirectory "windows-10\x64\signtool.exe"
$winCodeSignUrl = "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-$winCodeSignVersion/winCodeSign-$winCodeSignVersion.7z"
$winCodeSignSha256 = "CDAEC7154DDA7CC31F88D886E2489379A0625A737D610B5AE7F62A12F16743A4"
$sevenZip = Join-Path $projectRoot "node_modules\7zip-bin\win\x64\7za.exe"
$electronBuilder = Join-Path $projectRoot "node_modules\.bin\electron-builder.cmd"

if (!(Test-Path -LiteralPath $electronBuilder)) {
    throw "electron-builder is not installed. Run npm install first."
}

if (!(Test-Path -LiteralPath $winCodeSignMarker)) {
    New-Item -ItemType Directory -Force -Path $builderCache | Out-Null

    $downloadRequired = !(Test-Path -LiteralPath $winCodeSignArchive)
    if (!$downloadRequired) {
        $downloadRequired = (Get-FileHash -LiteralPath $winCodeSignArchive -Algorithm SHA256).Hash -ne $winCodeSignSha256
    }

    if ($downloadRequired) {
        Write-Host "Downloading winCodeSign $winCodeSignVersion..."
        & curl.exe -L --fail --silent --show-error $winCodeSignUrl --output $winCodeSignArchive
        if ($LASTEXITCODE -ne 0) {
            throw "Could not download winCodeSign $winCodeSignVersion."
        }
    }

    if ((Get-FileHash -LiteralPath $winCodeSignArchive -Algorithm SHA256).Hash -ne $winCodeSignSha256) {
        throw "The downloaded winCodeSign archive failed its SHA-256 check."
    }

    if (!(Test-Path -LiteralPath $sevenZip)) {
        throw "7zip-bin is not installed. Run npm install first."
    }

    New-Item -ItemType Directory -Force -Path $winCodeSignDirectory | Out-Null
    Write-Host "Preparing winCodeSign cache without macOS-only symbolic links..."
    & $sevenZip x -y -bd $winCodeSignArchive "-o$winCodeSignDirectory" "-xr!darwin" | Out-Null
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $winCodeSignMarker)) {
        throw "Could not prepare the winCodeSign cache."
    }
}

New-Item -ItemType Directory -Force -Path $electronCache | Out-Null
$env:ELECTRON_BUILDER_CACHE = $builderCache
$env:ELECTRON_CACHE = $electronCache

& $electronBuilder @BuilderArguments
exit $LASTEXITCODE

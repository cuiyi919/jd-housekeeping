$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not $env:REACT_NATIVE_PACKAGER_HOSTNAME) {
    $network = Get-NetIPConfiguration | Where-Object {
        $_.IPv4DefaultGateway -and $_.NetAdapter.HardwareInterface
    } | Select-Object -First 1
    if ($network) {
        $env:REACT_NATIVE_PACKAGER_HOSTNAME = $network.IPv4Address.IPAddress | Select-Object -First 1
    }
}
& npm.cmd start
exit $LASTEXITCODE

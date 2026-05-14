# ima2-genX one-click installer (Windows / PowerShell)
#
# Usage:
#   irm https://damagethundercat.github.io/ima2-gen/install-windows.ps1 | iex
#   powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
#
# Flow:
#   1. Check Node.js
#   2. Install @damagethundercat/ima2-gen globally
#   3. Run ima2x serve

$ErrorActionPreference = 'Stop'

$PkgName = '@damagethundercat/ima2-gen'
$CliName = 'ima2x'

function Print($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Warn($msg)  { Write-Host "WARN $msg" -ForegroundColor Yellow }
function Fail($msg)  { Write-Host "ERR  $msg" -ForegroundColor Red; exit 1 }

if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node --version
    Print "Node.js detected: $nodeVersion"
}
else {
    Warn 'Node.js is not installed.'
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Print 'Installing Node.js LTS with winget...'
        winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                    [System.Environment]::GetEnvironmentVariable('Path', 'User')
    }
    else {
        Fail 'Install Node.js from https://nodejs.org, then run this script again.'
    }
}

Print "Installing $PkgName globally..."
$installResult = & npm install -g $PkgName 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host $installResult
    Fail 'npm install failed. Check PowerShell permissions or configure a user-level npm prefix.'
}
Print "$PkgName installed."

Print "Starting ima2-genX with $CliName serve..."
Print 'If the browser does not open automatically, visit http://localhost:3333.'
Write-Host ''
& $CliName serve

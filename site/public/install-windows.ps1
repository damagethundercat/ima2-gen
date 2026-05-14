# ima2-genX one-click installer (Windows / PowerShell)

$ErrorActionPreference = 'Stop'

$PkgName = '@damagethundercat/ima2-gen'
$CliName = 'ima2x'

function Print($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Warn($msg)  { Write-Host "WARN $msg" -ForegroundColor Yellow }
function Fail($msg)  { Write-Host "ERR  $msg" -ForegroundColor Red; exit 1 }

if (Get-Command node -ErrorAction SilentlyContinue) {
    Print "Node.js detected: $(node --version)"
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
& npm install -g $PkgName

Print "Starting ima2-genX with $CliName serve..."
& $CliName serve

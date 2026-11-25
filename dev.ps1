<#
.SYNOPSIS
    NextNav dev launcher.

.DESCRIPTION
    .\dev.ps1          dev mode: Go backend + Vite dev server (hot reload)
    .\dev.ps1 build    production-ish: build web, embed, single binary, run
    .\dev.ps1 test     run all tests

    Env overrides: PORT (backend), DATA_DIR, WEB_PORT (vite), WEB_HOST (vite), GOTOOLCHAIN,
    ADMIN_USERNAME, ADMIN_PASSWORD, SEED_SAMPLE.

.EXAMPLE
    .\dev.ps1

.EXAMPLE
    $env:PORT='9000'; .\dev.ps1
#>
[CmdletBinding()]
param(
    [ValidateSet('dev', 'build', 'test')]
    [string]$Mode = 'dev'
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not $env:PORT)           { $env:PORT = '8787' }
if (-not $env:WEB_PORT)       { $env:WEB_PORT = '5173' }
if (-not $env:WEB_HOST)       { $env:WEB_HOST = '0.0.0.0' }
if (-not $env:DATA_DIR)       { $env:DATA_DIR = Join-Path $Root 'data' }
if (-not $env:GOTOOLCHAIN)    { $env:GOTOOLCHAIN = 'local' }
if (-not $env:ADMIN_USERNAME) { $env:ADMIN_USERNAME = 'admin' }
if (-not $env:ADMIN_PASSWORD) { $env:ADMIN_PASSWORD = 'admin123' }
if (-not $env:SEED_SAMPLE)    { $env:SEED_SAMPLE = '1' }

# PowerShell 5.1 writes native stderr as errors; keep going anyway.
$PSNativeCommandUseErrorActionPreference = $false

# Reset terminal input mode on exit so Ctrl+C never leaves console in raw mode
if (-not ([System.Management.Automation.PSTypeName]'NextNav.ConsoleHelper').Type) {
    try {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace NextNav {
    public static class ConsoleHelper {
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr GetStdHandle(int nStdHandle);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);

        public static void ResetInputMode() {
            try {
                IntPtr hIn = GetStdHandle(-10); // STD_INPUT_HANDLE
                if (hIn != IntPtr.Zero) {
                    // ENABLE_PROCESSED_INPUT (0x1) | ENABLE_LINE_INPUT (0x2) | ENABLE_ECHO_INPUT (0x4) | 
                    // ENABLE_MOUSE_INPUT (0x10) | ENABLE_INSERT_MODE (0x20) | ENABLE_QUICK_EDIT_MODE (0x40) | ENABLE_EXTENDED_FLAGS (0x80)
                    SetConsoleMode(hIn, 0x01F7);
                }
            } catch {}
        }
    }
}
'@ -ErrorAction SilentlyContinue
    } catch {}
}

function Reset-ConsoleState {
    try {
        if (([System.Management.Automation.PSTypeName]'NextNav.ConsoleHelper').Type) {
            [NextNav.ConsoleHelper]::ResetInputMode()
        }
    } catch {}

    try {
        [Console]::TreatControlCAsInput = $false
        [Console]::ResetColor()
        $flushLimit = 50
        while ([Console]::KeyAvailable -and $flushLimit -gt 0) {
            [void][Console]::ReadKey($true)
            $flushLimit--
        }
    } catch {}
}

function Stop-PortProcess([int]$Port) {
    try {
        $lines = netstat -ano -p tcp | Select-String ":$Port\s"
        $killed = @{}
        foreach ($line in $lines) {
            $parts = ($line.ToString().Trim() -split '\s+')
            if ($parts.Count -ge 5 -and $parts[1] -match ":$Port$") {
                $targetPid = 0
                if ([int]::TryParse($parts[-1], [ref]$targetPid)) {
                    if ($targetPid -gt 0 -and $targetPid -ne $PID -and -not $killed.ContainsKey($targetPid)) {
                        $killed[$targetPid] = $true
                        try {
                            & taskkill /PID $targetPid /T /F *>$null
                        } catch {}
                    }
                }
            }
        }
    } catch {}
}

function Require-Tool([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "'$Name' not found in PATH"
    }
}

function Write-Banner([string]$Text) {
    Write-Host ''
    Write-Host '--------------------------------------------' -ForegroundColor DarkGray
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host '--------------------------------------------' -ForegroundColor DarkGray
    Write-Host ''
}

function Ensure-NodeModules {
    $nm = Join-Path $Root 'web\node_modules'
    $tsc = Join-Path $nm '.bin\tsc.cmd'
    if ((Test-Path $nm) -and (Test-Path $tsc)) {
        return
    }
    Write-Banner 'Install web dependencies'
    Push-Location (Join-Path $Root 'web')
    try {
        if (Test-Path 'package-lock.json') {
            npm ci --no-audit --no-fund
        } else {
            npm install --no-audit --no-fund
        }
    } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
}

function Invoke-Dev {
    Require-Tool 'go'
    Require-Tool 'node'
    Ensure-NodeModules

    Write-Banner "Dev mode  backend :$($env:PORT)  vite :$($env:WEB_PORT)"
    Write-Host "Open http://localhost:$($env:WEB_PORT)"
    Write-Host ''

    $backend = Start-Process -FilePath 'go' `
        -ArgumentList @('run', './cmd/nextnav') `
        -WorkingDirectory (Join-Path $Root 'server') `
        -NoNewWindow -PassThru

    # Launch vite directly with node to bypass cmd.exe and batch prompt on Ctrl+C
    $viteCli = Join-Path $Root 'web\node_modules\vite\bin\vite.js'
    if (Test-Path $viteCli) {
        $frontend = Start-Process -FilePath 'node' `
            -ArgumentList @($viteCli) `
            -WorkingDirectory (Join-Path $Root 'web') `
            -NoNewWindow -PassThru
    } else {
        $frontend = Start-Process -FilePath 'cmd.exe' `
            -ArgumentList @('/c', 'npm', 'run', 'dev') `
            -WorkingDirectory (Join-Path $Root 'web') `
            -NoNewWindow -PassThru
    }

    Write-Host "backend pid=$($backend.Id)  frontend pid=$($frontend.Id)" -ForegroundColor DarkGray

    try {
        while (-not $backend.HasExited -and -not $frontend.HasExited) {
            Start-Sleep -Milliseconds 300
        }
    }
    finally {
        Write-Host ''
        Write-Host 'Stopping services...' -ForegroundColor DarkGray
        foreach ($p in @($backend, $frontend)) {
            if ($p) {
                try {
                    if (-not $p.HasExited) {
                        & taskkill /PID $p.Id /T /F *>$null
                    }
                } catch {}
            }
        }
        Stop-PortProcess -Port ([int]$env:PORT)
        Stop-PortProcess -Port ([int]$env:WEB_PORT)
        Reset-ConsoleState
        Write-Host 'Stopped cleanly.' -ForegroundColor Green
    }
}

function Invoke-Build {
    Require-Tool 'go'
    Require-Tool 'npm'
    Ensure-NodeModules

    Write-Banner 'Build frontend'
    Push-Location (Join-Path $Root 'web')
    try { npm run build } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'frontend build failed' }

    Write-Banner 'Embed web assets'
    & bash (Join-Path $Root 'scripts\embed-web.sh')
    if ($LASTEXITCODE -ne 0) { throw 'embed step failed' }

    Write-Banner 'Compile binary'
    $bin = Join-Path $Root 'bin'
    New-Item -ItemType Directory -Force $bin | Out-Null
    Push-Location (Join-Path $Root 'server')
    try { go build -trimpath -ldflags='-s -w' -o ..\bin\nextnav.exe ./cmd/nextnav } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'go build failed' }

    Write-Banner "Start  http://localhost:$($env:PORT)"
    & (Join-Path $bin 'nextnav.exe')
}

function Invoke-Test {
    Require-Tool 'go'
    Require-Tool 'npm'

    Write-Banner 'Go tests'
    Push-Location (Join-Path $Root 'server')
    try { go test ./... } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'go tests failed' }

    Write-Banner 'Frontend typecheck and tests'
    Push-Location (Join-Path $Root 'web')
    try {
        npm run typecheck
        if ($LASTEXITCODE -ne 0) { throw 'typecheck failed' }
        npm run test
    } finally { Pop-Location }
}

switch ($Mode) {
    'dev'   { Invoke-Dev }
    'build' { Invoke-Build }
    'test'  { Invoke-Test }
}

<#
.SYNOPSIS
    NextNav dev launcher.

.DESCRIPTION
    .\dev.ps1          dev mode: Go backend + Vite dev server (hot reload)
    .\dev.ps1 build    production-ish: build web, embed, single binary, run
    .\dev.ps1 test     run all tests

    Env overrides: PORT (backend), DATA_DIR, WEB_PORT (vite), GOTOOLCHAIN.

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

if (-not $env:PORT)     { $env:PORT = '8787' }
if (-not $env:WEB_PORT) { $env:WEB_PORT = '5173' }
if (-not $env:DATA_DIR) { $env:DATA_DIR = Join-Path $Root 'data' }
if (-not $env:GOTOOLCHAIN) { $env:GOTOOLCHAIN = 'local' }

# PowerShell 5.1 writes native stderr as errors; keep going anyway.
$PSNativeCommandUseErrorActionPreference = $false

function Require-Tool([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "'$Name' not found in PATH"
    }
}

function Write-Banner([string]$Text) {
    Write-Host ''
    Write-Host '────────────────────────────────────────────' -ForegroundColor DarkGray
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host '────────────────────────────────────────────' -ForegroundColor DarkGray
    Write-Host ''
}

function Ensure-NodeModules {
    $nm = Join-Path $Root 'web\node_modules'
    $tsc = Join-Path $nm '.bin\tsc.cmd'
    # A missing node_modules is obvious; a half-installed one is the common
    # failure mode (interrupted install), so check for a real binary too.
    if ((Test-Path $nm) -and (Test-Path $tsc)) {
        return
    }
    Write-Banner '安装前端依赖'
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
    Require-Tool 'npm'
    Ensure-NodeModules

    Write-Banner "开发模式  backend :$($env:PORT)  vite :$($env:WEB_PORT)"
    Write-Host "打开 http://localhost:$($env:WEB_PORT)"
    Write-Host ''

    $backend = Start-Process -FilePath 'go' `
        -ArgumentList @('run', './cmd/nextnav') `
        -WorkingDirectory (Join-Path $Root 'server') `
        -NoNewWindow -PassThru

    # npm is a .cmd shim on Windows; run it through cmd so arguments survive.
    # PORT and WEB_PORT are inherited from this process; vite.config.ts uses
    # them for its listen port and API proxy target.
    $frontend = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList @('/c', 'npm', 'run', 'dev') `
        -WorkingDirectory (Join-Path $Root 'web') `
        -NoNewWindow -PassThru

    Write-Host "backend pid=$($backend.Id)  frontend pid=$($frontend.Id)" -ForegroundColor DarkGray

    try {
        while (-not $backend.HasExited -and -not $frontend.HasExited) {
            Start-Sleep -Milliseconds 300
        }
    }
    finally {
        Write-Host ''
        Write-Host '正在停止…' -ForegroundColor DarkGray
        foreach ($p in @($backend, $frontend)) {
            if ($p -and -not $p.HasExited) {
                # Kill the whole tree: `go run` and cmd.exe spawn children.
                & taskkill /PID $p.Id /T /F 2>&1 | Out-Null
            }
        }
    }
}

function Invoke-Build {
    Require-Tool 'go'
    Require-Tool 'npm'
    Ensure-NodeModules

    Write-Banner '构建前端'
    Push-Location (Join-Path $Root 'web')
    try { npm run build } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'frontend build failed' }

    Write-Banner '内嵌到 Go 二进制'
    & bash (Join-Path $Root 'scripts\embed-web.sh')
    if ($LASTEXITCODE -ne 0) { throw 'embed step failed' }

    Write-Banner '编译'
    $bin = Join-Path $Root 'bin'
    New-Item -ItemType Directory -Force $bin | Out-Null
    Push-Location (Join-Path $Root 'server')
    try { go build -trimpath -ldflags='-s -w' -o ..\bin\nextnav.exe ./cmd/nextnav } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'go build failed' }

    Write-Banner "启动  http://localhost:$($env:PORT)"
    & (Join-Path $bin 'nextnav.exe')
}

function Invoke-Test {
    Require-Tool 'go'
    Require-Tool 'npm'

    Write-Banner 'Go 测试'
    Push-Location (Join-Path $Root 'server')
    try { go test ./... } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'go tests failed' }

    Write-Banner '前端类型检查与测试'
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
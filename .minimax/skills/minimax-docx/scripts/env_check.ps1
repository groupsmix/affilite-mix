# minimax-docx strict environment check (Windows PowerShell mirror of env_check.sh)
# Authoritative for whether the skill may run on Windows.
# Supports -Level Read|Render|Full (default Full). Output format and exit codes
# match env_check.sh so the daemon's gate hook can compare them line-by-line.
#Requires -Version 5.1

[CmdletBinding()]
param(
    # NOTE: intentionally NOT using [ValidateSet]. ValidateSet rejects with PowerShell exit 1
    # which would conflate "NOT READY" with "bad CLI args". env_check.sh exits 2 for bad args
    # and 1 for NOT READY; we mirror that with manual validation below.
    [string]$Level = 'Full'
)

$ErrorActionPreference = 'Stop'
# Same UTF-8 enforcement as setup.ps1: chcp first (so child processes inherit UTF-8 code page),
# then [Console]::OutputEncoding (so PowerShell's view of stdout/stderr matches).
try { & chcp.com 65001 *> $null } catch { }
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.UTF8Encoding]::new()
$env:DOTNET_CLI_UI_LANGUAGE = 'en'

# Manual validation (mirror env_check.sh exit codes).
$ValidLevels = @('Read', 'Render', 'Full')
if ($ValidLevels -notcontains $Level) {
    [Console]::Error.WriteLine("Invalid -Level value: '$Level'. Must be one of: Read, Render, Full")
    exit 2
}

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$DotnetDir  = Join-Path $ScriptDir 'dotnet'
$DotnetRequiredMajor = 9

function Test-Command($Name) { [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

function Resolve-SofficePath {
    foreach ($n in @('soffice.exe', 'soffice')) {
        $cmd = Get-Command $n -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }
    $candidates = @(
        (Join-Path $env:ProgramFiles 'LibreOffice\program\soffice.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'LibreOffice\program\soffice.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\LibreOffice\program\soffice.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\soffice.exe'),
        (Join-Path $env:USERPROFILE  'scoop\apps\libreoffice\current\program\soffice.exe')
    ) | Where-Object { $_ }
    foreach ($p in $candidates) { if (Test-Path $p) { return (Resolve-Path $p).Path } }
    return $null
}

function Resolve-PdftoppmPath {
    foreach ($n in @('pdftoppm.exe', 'pdftoppm', 'pdftocairo.exe', 'pdftocairo')) {
        $cmd = Get-Command $n -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }
    $candidates = @(
        (Join-Path $env:USERPROFILE 'scoop\apps\poppler\current\bin\pdftoppm.exe'),
        (Join-Path $env:ProgramData 'chocolatey\bin\pdftoppm.exe')
    ) | Where-Object { $_ }
    foreach ($p in $candidates) { if (Test-Path $p) { return (Resolve-Path $p).Path } }
    return $null
}

function Resolve-PythonCommand {
    foreach ($name in @('python', 'python3', 'py')) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if (-not $cmd) { continue }
        if ($name -eq 'py') {
            try {
                & $cmd.Source -3 --version *> $null
                if ($LASTEXITCODE -eq 0) { return @{ Cmd = $cmd.Source; Args = @('-3') } }
            } catch { continue }
        } else {
            return @{ Cmd = $cmd.Source; Args = @() }
        }
    }
    return $null
}

# Look for dotnet.exe at common install locations. Returns the full path if
# found on disk even when `Get-Command dotnet` says no — that gap is the
# "installed but not on session PATH" case (winget / installer wrote Machine
# PATH, the current PowerShell session still has stale $env:Path).
function Resolve-DotnetInstallPath {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'dotnet\dotnet.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'dotnet\dotnet.exe'),
        (Join-Path $env:USERPROFILE  '.dotnet\dotnet.exe'),
        (Join-Path $env:LOCALAPPDATA  'Microsoft\dotnet\dotnet.exe')
    ) | Where-Object { $_ }
    foreach ($p in $candidates) { if (Test-Path $p) { return (Resolve-Path $p).Path } }
    return $null
}

# Render the exact one-liner that pulls fresh Machine+User PATH into the
# current session — used in NOT READY hints below.
$Script:PathSyncOneLiner = '$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")'

Write-Host "=== minimax-docx Environment Check (level: $Level) ==="
Write-Host ""

$Status = 'READY'
# Match env_check.sh's `printf '[OK]      %-14s %s\n'` — 14-char left-justified column,
# ONE space separator, then the value. Without the explicit space, the format string
# `{0,-14}{1}` collapses when the name is exactly 14 chars wide.
function CheckOk   { param([string]$Name, [string]$Detail) Write-Host ("[OK]      {0,-14} {1}" -f $Name, $Detail) }
function CheckFail { param([string]$Name, [string]$Detail) Write-Host ("[FAIL]    {0,-14} {1}" -f $Name, $Detail); $script:Status = 'NOT READY' }

# --- read-level checks (always run) ---

$py = Resolve-PythonCommand
if (-not $py) {
    CheckFail 'python3' 'not found'
} else {
    $verLine = & $py.Cmd @($py.Args + '--version') 2>&1
    $verNum  = ($verLine -join ' ') -replace '.*?(\d+\.\d+(?:\.\d+)?).*', '$1'
    CheckOk 'python3' $verNum
}

# unzip OR tar.exe (Windows 10 1803+) OR built-in Expand-Archive — any of them counts
if (Test-Command unzip) {
    CheckOk 'unzip' 'available'
} elseif (Test-Command tar) {
    CheckOk 'unzip' 'tar.exe (Windows 10+ native, handles .zip)'
} elseif (Get-Command Expand-Archive -ErrorAction SilentlyContinue) {
    CheckOk 'unzip' 'Expand-Archive (PowerShell built-in)'
} else {
    CheckFail 'unzip' 'no zip extractor found (unzip / tar.exe / Expand-Archive)'
}

# Locale / encoding — UTF-8 console required for CJK
$enc = [Console]::OutputEncoding.WebName
if ($enc -match '^utf-?8$') {
    CheckOk 'locale' "console=$enc"
} else {
    # Try to force UTF-8 for this session and re-check
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $enc2 = [Console]::OutputEncoding.WebName
    if ($enc2 -match '^utf-?8$') {
        CheckOk 'locale' "console=$enc2 (forced for this session)"
    } else {
        CheckFail 'locale' "console=$enc — UTF-8 required, cannot force"
    }
}

# Permission analogue on Windows: scripts unblocked (no Mark-of-the-Web).
# A blocked script will throw on Get-Item with -Stream Zone.Identifier.
$blocked = 0
foreach ($s in (Get-ChildItem -Path $ScriptDir -File -Filter '*.ps1' -ErrorAction SilentlyContinue)) {
    try {
        $null = Get-Item -LiteralPath $s.FullName -Stream 'Zone.Identifier' -ErrorAction Stop
        $blocked++
    } catch {
        # No Zone.Identifier stream means NOT blocked — that's the desired state.
    }
}
if ($blocked -eq 0) {
    CheckOk 'permissions' 'all .ps1 scripts unblocked'
} else {
    CheckFail 'permissions' "$blocked .ps1 script(s) carry Mark-of-the-Web (run setup.ps1 to unblock)"
}

# --- render-level checks (render + full) ---

if ($Level -in @('Render', 'Full')) {
    $sof = Resolve-SofficePath
    if ($sof) { CheckOk 'soffice' $sof } else { CheckFail 'soffice' 'not found (run setup.ps1 -Level Render to install LibreOffice)' }

    $pp = Resolve-PdftoppmPath
    if ($pp) { CheckOk 'pdftoppm' $pp } else { CheckFail 'pdftoppm' 'not found (run setup.ps1 -Level Render to install poppler)' }
}

# --- full-level checks (full only) ---

if ($Level -eq 'Full') {
    if (-not (Test-Command dotnet)) {
        $diskPath = Resolve-DotnetInstallPath
        if ($diskPath) {
            # Installed on disk but stale session PATH — emit a precise hint
            # instead of the generic "not found" so the next action is obvious.
            CheckFail 'dotnet' "on disk at $diskPath but NOT on this PowerShell session's PATH (run: $Script:PathSyncOneLiner or open a new PowerShell window)"
            $script:DotnetPathStale = $true
        } else {
            CheckFail 'dotnet' 'not found (run setup.ps1 -Level Full to install .NET SDK 9)'
        }
    } else {
        $ver = (& dotnet --version 2>$null)
        if (-not $ver) { $ver = '0.0.0' }
        try {
            $major = [int](($ver -split '\.')[0])
        } catch { $major = 0 }
        if ($major -ge $DotnetRequiredMajor) {
            CheckOk 'dotnet' "$ver (>= $DotnetRequiredMajor.0)"
        } else {
            CheckFail 'dotnet' "$ver (requires >= $DotnetRequiredMajor.0)"
        }
    }

    if (-not (Test-Command pandoc)) {
        CheckFail 'pandoc' 'not found (run setup.ps1 -Level Full to install pandoc)'
    } else {
        $pv = ((& pandoc --version 2>$null | Select-Object -First 1) -replace '.*?(\d+\.\d+(?:\.\d+)?).*', '$1')
        CheckOk 'pandoc' $pv
    }

    if (Test-Command zip) {
        CheckOk 'zip' 'available'
    } elseif (Get-Command Compress-Archive -ErrorAction SilentlyContinue) {
        CheckOk 'zip' 'Compress-Archive (PowerShell built-in)'
    } else {
        CheckFail 'zip' 'no zip writer (zip.exe / Compress-Archive)'
    }

    if (-not (Test-Path $DotnetDir -PathType Container)) {
        CheckFail 'project' "directory not found: $DotnetDir"
    } else {
        $built = $false
        foreach ($tfm in @('net10.0', 'net9.0', 'net8.0')) {
            $dll = Join-Path $DotnetDir "MiniMaxAIDocx.Cli\bin\Debug\$tfm\MiniMaxAIDocx.Cli.dll"
            if (Test-Path $dll) { $built = $true; break }
        }
        if ($built) {
            CheckOk 'project' 'built'
        } else {
            try {
                & dotnet restore $DotnetDir --verbosity quiet *> $null
                if ($LASTEXITCODE -eq 0) {
                    & dotnet build $DotnetDir --verbosity quiet --no-restore *> $null
                    if ($LASTEXITCODE -eq 0) {
                        CheckOk 'project' 'restore+build succeeded'
                    } else {
                        CheckFail 'project' 'restore succeeded but build failed'
                    }
                } else {
                    CheckFail 'project' 'restore failed'
                }
            } catch {
                CheckFail 'project' "restore/build threw: $_"
            }
        }
    }
}

Write-Host ""
if ($Status -eq 'READY') {
    Write-Host 'Status: READY'
    exit 0
} else {
    Write-Host 'Status: NOT READY'
    Write-Host ''
    if ($script:DotnetPathStale) {
        # PATH-stale is the single most common Windows footgun after a fresh
        # winget install — call it out first with the exact fix command.
        Write-Host '⚠  dotnet is installed but not visible to this PowerShell session.'
        Write-Host '   Quick fix without restarting the shell:'
        Write-Host "     $Script:PathSyncOneLiner"
        Write-Host '   Or simply open a new PowerShell window and re-run env_check.ps1.'
        Write-Host ''
    }
    if ($Level -eq 'Read') {
        Write-Host 'The read-level gate requires: python (3.x), zip extractor, UTF-8 console, unblocked scripts.'
        Write-Host "Re-run: powershell -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`" -Level Read"
    } elseif ($Level -eq 'Render') {
        Write-Host 'The render-level gate requires all read-level items plus: soffice.exe, pdftoppm.exe.'
        Write-Host "Run: powershell -ExecutionPolicy Bypass -File `"$ScriptDir\setup.ps1`" -Level Render"
    } else {
        Write-Host "Run: powershell -ExecutionPolicy Bypass -File `"$ScriptDir\setup.ps1`""
        Write-Host 'This script must succeed before any minimax-docx skill run on Windows.'
    }
    exit 1
}

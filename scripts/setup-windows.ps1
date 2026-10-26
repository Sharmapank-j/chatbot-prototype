$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Indica Anime Us — local setup preflight" -ForegroundColor Cyan
Write-Host "This script checks tools and creates local folders. It does NOT download AI model weights or upload files."
Write-Host ""

function Show-CommandStatus([string]$Name, [string]$Command, [string]$Args = "--version") {
  $cmd = Get-Command $Command -ErrorAction SilentlyContinue
  if (-not $cmd) {
    Write-Host ("[MISSING] {0}: command '{1}' not found" -f $Name, $Command) -ForegroundColor Yellow
    return
  }
  try {
    $output = & $Command $Args 2>&1 | Select-Object -First 1
    Write-Host ("[FOUND]   {0}: {1}" -f $Name, $output) -ForegroundColor Green
  } catch {
    Write-Host ("[FOUND]   {0}: executable exists (version check needs attention)" -f $Name) -ForegroundColor Yellow
  }
}

Show-CommandStatus "Node.js" "node"
Show-CommandStatus "npm" "npm"
Show-CommandStatus "Python" "python" "--version"
Show-CommandStatus "Git" "git"
Show-CommandStatus "FFmpeg" "ffmpeg" "-version"
Show-CommandStatus "FFprobe" "ffprobe" "-version"
Show-CommandStatus "Tesseract OCR" "tesseract" "--version"

if (-not (Test-Path ".env.local")) {
  if (Test-Path ".env.indica.example") {
    Copy-Item ".env.indica.example" ".env.local"
    Write-Host "[CREATED] .env.local from .env.indica.example" -ForegroundColor Green
  } else {
    Write-Host "[WARNING] .env.indica.example not found" -ForegroundColor Yellow
  }
} else {
  Write-Host "[KEPT] .env.local already exists; not overwriting it." -ForegroundColor Cyan
}

$folders = @("workspace", "workspace/projects", "workspace/cache", "workspace/exports", "models")
foreach ($folder in $folders) {
  New-Item -ItemType Directory -Force -Path $folder | Out-Null
}
Write-Host "[CREATED] Local workspace folders (empty; no comic files or models copied)." -ForegroundColor Green

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Host "Install Python 3.11+ and rerun this script." -ForegroundColor Yellow
} else {
  $pythonVersion = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
  if ([version]$pythonVersion -lt [version]"3.11") {
    Write-Host "Python $pythonVersion found; Python 3.11+ is recommended for the worker." -ForegroundColor Yellow
  } else {
    if (-not (Test-Path ".venv")) {
      & python -m venv .venv
      Write-Host "[CREATED] Python virtual environment at .venv" -ForegroundColor Green
    } else {
      Write-Host "[KEPT] Existing .venv" -ForegroundColor Cyan
    }
  }
}

Write-Host ""
Write-Host "Preflight complete." -ForegroundColor Cyan
Write-Host "Local comic parsing, OCR, TTS, GPU generation, and MP4 export require their respective implementation/tools; this script does not claim those stages are connected."
Write-Host "Next: read docs/OFFLINE_MODE.md and docs/ROADMAP.md."

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
Show-CommandStatus "Piper TTS" "piper" "--help"

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
Write-Host "Local FFmpeg rendering is provided by scripts/indica_local_worker.py; Piper speech requires a user-installed Piper executable and ONNX voice model."
Write-Host "Start the web UI with: npm ci; npm run dev"
Write-Host "Start the local renderer in a second terminal with: python scripts/indica_local_worker.py"
Write-Host "The renderer prints a random token. Paste it in the Studio Export tab. Keep the worker bound to loopback."
Write-Host "Set INDICA_PIPER_MODEL to your licensed .onnx voice model path before starting the worker."
Write-Host "Next: read docs/PROTOTYPE_GUIDE.md and docs/AGENT_ORCHESTRATION.md."
